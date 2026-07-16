'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { NumberInput, TextInput } from './UIComponents';
import { T, fe, Spinner } from '@/components/Theme';
import { forecastMonthEnd, categoryStatus, annualSummary, periodTrend, detectRecurring, RecurringCharge } from '@/lib/billing/budget';
import { reservePlan, rolloverNext, strWaterfall, climateFeePerNight, recommendedReserves, investmentReturns } from '@/lib/billing/budgetPro';
import { incomeStatement, taxProvision } from '@/lib/accounting/statement';
import { annuityMonthly, interestForYear } from '@/lib/loans/recommend';
import { InfoDot } from './UIComponents';
import { KPI } from './LoanShared';
import BudgetVaults, { VaultSuggestion } from './BudgetVaults';
import BudgetImport from './BudgetImport';

// Μήνες-παράθυρα εισφοράς μέχρι την προθεσμία: 0 αν λείπει ή έχει περάσει (σύγκριση
// ΗΜΕΡΑΣ)· τουλάχιστον 1 για μελλοντική προθεσμία, ακόμη κι αργότερα μέσα στον μήνα.
const parseLocalDate = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);   // τοπική ημερομηνία (όχι UTC) — χωρίς off-by-one στα όρια
};
const monthsUntilDue = (due?: string): number => {
  if (!due) return 0;
  const d = parseLocalDate(due), now = new Date();
  if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) return 0;
  const m = (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth());
  return Math.max(1, m);
};

// Κατηγορίες που θεωρούνται «σταθερές» (πάγιοι λογαριασμοί, χρεώνονται ολόκληρο
// τον μήνα) — δεν προβάλλονται γραμμικά. Οι υπόλοιπες συσσωρεύονται μέσα στον μήνα.
const FIXED_CATS = ['electricity', 'water', 'internet', 'heating', 'insurance', 'services', 'common'];
const ymOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
// Προτεινόμενη ημερομηνία-στόχος ΕΝΦΙΑ: τέλος Φεβρουαρίου (τελευταία δόση).
const nextFeb = (): string => {
  const now = new Date();
  const y = now.getMonth() >= 1 ? now.getFullYear() + 1 : now.getFullYear();
  return `${y}-02-28`;
};

// Μικρογράφημα τάσης 12 μηνών ανά κατηγορία (από το φορτωμένο ιστορικό). Το σημείο
// του επιλεγμένου μήνα τονίζεται με γαλάζιο. Κρύβεται αν δεν υπάρχει καθόλου ιστορικό.
function Sparkline({ values, activeIndex }: { values: number[]; activeIndex: number }) {
  const w = 54, h = 14, pad = 2;
  if (values.every(v => !v)) return <span style={{ width: w, flexShrink: 0 }} aria-hidden="true" />;
  const max = Math.max(1, ...values);
  const n = values.length;
  const x = (i: number) => n <= 1 ? pad : pad + (i * (w - 2 * pad)) / (n - 1);
  const y = (v: number) => h - pad - (Math.max(0, v) / max) * (h - 2 * pad);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} style={{ display: 'block', flexShrink: 0 }} aria-hidden="true">
      <polyline points={pts} fill="none" stroke="color-mix(in srgb, var(--text-primary) 28%, transparent)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      {activeIndex >= 0 && <circle cx={x(activeIndex)} cy={y(values[activeIndex] || 0)} r="1.9" fill="var(--accent)" />}
    </svg>
  );
}

// Ράβδοι εξόδων ανά μήνα — premium, στο ΓΑΛΑΖΙΟ της παλέτας μας (accent): απαλή κάθετη
// διαβάθμιση, στρογγυλεμένη κορυφή, baseline· στο πέρασμα του κέρσορα φωτίζεται, σηκώνεται
// (3D lift + glow) και δείχνει το ποσό. Οι κενοί μήνες μένουν διακριτικά «σβηστοί».
function MonthBars({ data, activeYm }: { data: { ym: string; label: string; value: number }[]; activeYm: string }) {
  const [hi, setHi] = useState<number | null>(null);
  const max = Math.max(1, ...data.map(d => d.value));
  const H = 84;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: H + 22, borderBottom: '1px solid var(--border-subtle)' }}>
      {data.map((d, i) => {
        const h = d.value > 0 ? Math.max(4, Math.round((d.value / max) * (H - 6))) : 0;
        const active = d.ym === activeYm, on = hi === i;
        const top = on ? 100 : active ? 92 : 62;
        const bot = on ? 66 : active ? 56 : 30;
        return (
          <div key={d.ym} onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)} onTouchStart={() => setHi(i)} onTouchEnd={() => setHi(null)}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, minWidth: 0, cursor: 'default' }}>
            <div style={{ position: 'relative', width: '100%', maxWidth: 26, height: H, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
              {on && d.value > 0 && (
                <div style={{ position: 'absolute', bottom: h + 8, left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-overlay)', border: '1px solid var(--border-accent)', borderRadius: 7, padding: '3px 8px', fontSize: 10.5, fontWeight: 700, color: 'var(--accent)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', boxShadow: '0 8px 20px -6px color-mix(in srgb, var(--accent) 45%, transparent)', zIndex: 3 }}>{fe(d.value, 0)}</div>
              )}
              <div style={{ width: '100%', height: Math.max(h, 3), borderRadius: '6px 6px 2px 2px', background: d.value > 0 ? `linear-gradient(180deg, color-mix(in srgb, var(--accent) ${top}%, transparent), color-mix(in srgb, var(--accent) ${bot}%, transparent))` : 'color-mix(in srgb, var(--text-primary) 8%, transparent)', transform: on ? 'translateY(-3px)' : 'none', boxShadow: on ? '0 10px 22px -6px color-mix(in srgb, var(--accent) 55%, transparent)' : 'none', transition: 'height 0.55s cubic-bezier(0.22,1,0.36,1), background 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease' }} />
            </div>
            <span style={{ fontSize: 8.5, color: on || active ? 'var(--accent)' : 'var(--text-tertiary)', fontFamily: T.font.sans, fontWeight: on || active ? 700 : 500, transition: 'color 0.15s' }}>{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// Δαχτυλίδι (donut) κατανομής — premium, στο ΓΑΛΑΖΙΟ μας: τόξα σε αποχρώσεις accent με
// στρογγυλά άκρα και μικρά κενά, ζωντανή αντίδραση (το τόξο/υπόμνημα που δείχνει ο
// κέρσορας ανοίγει, φωτίζεται με λάμψη) και κέντρο που δείχνει κατηγορία, ποσό και %.
function Donut({ slices }: { slices: { label: string; value: number }[] }) {
  const [hi, setHi] = useState<number | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return null;
  const sorted = slices.filter(s => s.value > 0).sort((a, b) => b.value - a.value);
  const MAX = 6;
  let segs = sorted;
  if (sorted.length > MAX) {
    const head = sorted.slice(0, MAX - 1);
    const rest = sorted.slice(MAX - 1).reduce((s, x) => s + x.value, 0);
    segs = [...head, { label: 'Λοιπά', value: rest }];
  }
  const r = 46, sw = 13, C = 2 * Math.PI * r;
  const GAP = segs.length > 1 ? 5 : 0;   // κενό μεταξύ τόξων (σε μονάδες περιμέτρου)
  const shade = (i: number, on: boolean) => `color-mix(in srgb, var(--accent) ${Math.min(100, Math.max(32, 94 - i * 13) + (on ? 6 : 0))}%, transparent)`;
  const active = hi != null ? segs[hi] : null;
  let off = 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
      <svg width="128" height="128" viewBox="0 0 128 128" style={{ flexShrink: 0, overflow: 'visible' }}>
        {/* Κανάλι δαχτυλιδιού */}
        <circle cx="64" cy="64" r={r} fill="none" stroke="color-mix(in srgb, var(--accent) 10%, transparent)" strokeWidth={sw} />
        <g transform="rotate(-90 64 64)">
          {segs.map((s, i) => {
            const on = hi === i;
            const raw = (s.value / total) * C;
            const len = Math.max(0.5, raw - GAP);
            const el = (
              <circle key={i} cx="64" cy="64" r={r} fill="none" stroke={shade(i, on)} strokeWidth={on ? sw + 5 : sw} strokeLinecap="round"
                strokeDasharray={`${len.toFixed(2)} ${(C - len).toFixed(2)}`} strokeDashoffset={(-off).toFixed(2)}
                onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)}
                style={{ transition: 'stroke-width 0.2s ease, stroke 0.2s ease', cursor: 'default', filter: on ? 'drop-shadow(0 3px 8px color-mix(in srgb, var(--accent) 50%, transparent))' : 'none' }} />
            );
            off += raw;
            return el;
          })}
        </g>
        <text x="64" y="58" textAnchor="middle" style={{ fontSize: 8, fill: 'var(--text-tertiary)', fontFamily: T.font.sans, letterSpacing: '0.04em', transition: 'fill 0.15s' }}>{active ? active.label.slice(0, 16).toUpperCase() : 'ΣΥΝΟΛΟ'}</text>
        <text x="64" y="74" textAnchor="middle" style={{ fontSize: 15, fontWeight: 700, fill: active ? 'var(--accent)' : 'var(--text-primary)', fontFamily: T.font.num, transition: 'fill 0.15s' }}>{fe(active ? active.value : total, 0)}</text>
        {active && <text x="64" y="87" textAnchor="middle" style={{ fontSize: 8.5, fill: 'var(--text-tertiary)', fontFamily: T.font.num }}>{Math.round((active.value / total) * 100)}%</text>}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 150 }}>
        {segs.map((s, i) => {
          const on = hi === i;
          return (
            <div key={i} onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)}
              style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 11.5, fontFamily: T.font.sans, padding: '4px 8px', margin: '0 -8px', borderRadius: 7, background: on ? 'var(--bg-elevated)' : 'transparent', cursor: 'default', transition: 'background 0.15s' }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: shade(i, on), flexShrink: 0, boxShadow: on ? '0 2px 6px -1px color-mix(in srgb, var(--accent) 55%, transparent)' : 'none', transition: 'background 0.15s, box-shadow 0.15s' }} />
              <span style={{ flex: 1, minWidth: 0, color: on ? 'var(--text-primary)' : 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'color 0.15s' }}>{s.label}</span>
              <span style={{ color: 'var(--text-tertiary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', fontSize: 10.5 }}>{fe(s.value, 0)}</span>
              <span style={{ width: 34, textAlign: 'right', color: on ? 'var(--accent)' : 'var(--text-secondary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', fontWeight: 700, transition: 'color 0.15s' }}>{Math.round((s.value / total) * 100)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Category definitions ──────────────────────────────────────────────────────
const CATS = [
  { key: 'electricity',  label: 'Ρεύμα',              default: 80  },
  { key: 'water',        label: 'Νερό',                default: 25  },
  { key: 'internet',     label: 'Internet και τηλεφωνία',default: 35 },
  { key: 'heating',      label: 'Θέρμανση',            default: 60  },
  { key: 'insurance',    label: 'Ασφάλεια και συνδρομές',default: 30 },
  { key: 'services',     label: 'Υπηρεσίες, ΕΝΦΙΑ',  default: 50  },
  { key: 'common',       label: 'Κοινόχρηστα',         default: 40  },
  { key: 'maintenance',  label: 'Συντήρηση',           default: 20  },
  { key: 'other',        label: 'Λοιπές δαπάνες',      default: 50  },
] as const;

type CatKey = typeof CATS[number]['key'];

// Ο διαμοιρασμός δαπανών/λογαριασμών γίνεται πλέον ΑΝΑ ΕΓΓΡΑΦΗ (πεδίο
// «Πληρώνει / Διαμοιρασμός» στη δαπάνη ή τον λογαριασμό) — ΕΝΑ μοντέλο σε όλη
// την εφαρμογή. Ο προϋπολογισμός εδώ κρατά μόνο στόχους έναντι πραγματικών.

interface Props { propertyId: string; userId?: string; profileType?: 'individual' | 'professional'; }

export default function BillsBudget({ propertyId, userId = '', profileType = 'individual' }: Props) {
  const isPro = profileType === 'professional';
  const supabase  = createClient();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── State ──────────────────────────────────────────────────────────────────
  const initBudgets = (): Record<string, string> => {
    const b: Record<string, string> = { total: '390' };
    CATS.forEach(c => { b[c.key] = String(c.default); });
    return b;
  };

  const [budgets,      setBudgets]      = useState<Record<string, string>>(initBudgets);
  const [actuals,      setActuals]      = useState<Record<string, number>>({});
  // Ιστορικό ανά μήνα (YYYY-MM → σύνολο) και ανά μήνα/κατηγορία, από ΚΑΤΑΓΕΓΡΑΜΜΕΝΕΣ
  // εγγραφές (λογαριασμοί + λοιπές δαπάνες) — για πρόβλεψη, ετήσια εικόνα και τάσεις.
  const [monthTotals,  setMonthTotals]  = useState<Record<string, number>>({});
  const [catMonth,     setCatMonth]     = useState<Record<string, Record<string, number>>>({});
  // Έσοδα + δεσμευμένες εκροές (δόση δανείου, εισφορές κουμπαράδων) για το «Ασφαλές διαθέσιμο».
  const [income,       setIncome]       = useState(0);
  const [incomeYtd,    setIncomeYtd]    = useState(0);
  const [loanMonthly,  setLoanMonthly]  = useState(0);
  const [vaultMonthly, setVaultMonthly] = useState(0);
  const [rentalMode,   setRentalMode]   = useState<'long_term' | 'short_term' | ''>('');
  const [strNights,    setStrNights]    = useState(0);
  // Έξυπνες προτάσεις αποθεματικών/φόρου (ΕΝΦΙΑ, φόρος, CapEx, κενές περίοδοι),
  // υπολογισμένες με τους κανονικούς μηχανισμούς — περνούν στους κουμπαράδες.
  const [suggestions,  setSuggestions]  = useState<VaultSuggestion[]>([]);
  const [recurring,    setRecurring]    = useState<RecurringCharge[]>([]);
  const [weekActuals,  setWeekActuals]  = useState<Record<string, number>>({});
  // Απόδοση επένδυσης (μόνο επαγγελματίας) και πλήθος βραχυχρόνιων ακινήτων (μόνο ιδιώτης, όριο 3+).
  const [invReturns,   setInvReturns]   = useState<{ noi: number; preTaxCashFlow: number; capRatePct: number; cashOnCashPct: number } | null>(null);
  const [strPropCount, setStrPropCount] = useState(0);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [editMode,     setEditMode]     = useState(false);
  const [rtOk,         setRtOk]         = useState(false);
  const [heroHover,    setHeroHover]    = useState(false);
  const [hoverCat,     setHoverCat]     = useState<string | null>(null);
  const [delCatHover,  setDelCatHover]  = useState<string | null>(null);
  const [newCatName,   setNewCatName]   = useState('');
  const [hoverRec,     setHoverRec]     = useState<string | null>(null);
  const [hoverWeek,    setHoverWeek]    = useState<string | null>(null);
  // Πλοήγηση μήνα: 0 = τρέχων, −1 = προηγούμενος … έως −12 (από το φορτωμένο ιστορικό).
  const [monthOffset,  setMonthOffset]  = useState(0);
  // Ελαχιστοποίηση ενοτήτων (μνήμη ανά ακίνητο).
  const [collapsed,    setCollapsed]    = useState<Set<string>>(new Set());
  useEffect(() => {
    try { const s = localStorage.getItem(`budget_collapsed_${propertyId}`); if (s) setCollapsed(new Set(JSON.parse(s))); } catch { /* ignore */ }
  }, [propertyId]);
  const toggleCollapse = (key: string) => setCollapsed(prev => {
    const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key);
    try { localStorage.setItem(`budget_collapsed_${propertyId}`, JSON.stringify([...n])); } catch { /* ignore */ }
    return n;
  });

  const mapCategory = (cat: string): CatKey | 'other' => {
    const m: Record<string, CatKey> = {
      electricity: 'electricity', water: 'water', eydap: 'water',
      internet: 'internet', phone: 'internet', tv: 'internet',
      heating: 'heating', gas: 'heating',
      insurance: 'insurance', streaming: 'insurance',
      taxes: 'services', enfia: 'services', municipal: 'services', services: 'services',
      common: 'common', koinoxrista: 'common',
      maintenance: 'maintenance', repair: 'maintenance',
    };
    return m[cat?.toLowerCase()] ?? 'other';
  };

  const loadData = useCallback(async () => {
    if (!propertyId) return;
    try {
      const now   = new Date();
      const y     = now.getFullYear();
      const m     = String(now.getMonth() + 1).padStart(2, '0');
      const start   = `${y}-${m}-01`;
      const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
      const dateEnd = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;      // για στήλες τύπου date
      const end     = `${dateEnd}T23:59:59`;                                 // για timestamptz (created_at)
      // Ιστορικό 13 μηνών (τρέχων + 12 πίσω) για πρόβλεψη/ετήσια εικόνα/τάσεις.
      const histStart = `${ymOf(new Date(y, now.getMonth() - 12, 1))}-01`;
      // Αρχή τρέχουσας εβδομάδας (Δευτέρα) — για το εβδομαδιαίο εργαλείο (σωστό και στα όρια μήνα).
      const dow       = (now.getDay() + 6) % 7;   // Δευτέρα = 0
      const weekStartD = new Date(y, now.getMonth(), now.getDate() - dow);
      const weekStart  = `${weekStartD.getFullYear()}-${String(weekStartD.getMonth() + 1).padStart(2, '0')}-${String(weekStartD.getDate()).padStart(2, '0')}`;

      const [budgetRes, billsRes, settRes, expRes, histBillsRes, histExpRes, weekBillsRes, weekExpRes] = await Promise.all([
        supabase.from('bills_settings').select('data').eq('property_id', propertyId).eq('section', 'budgets').maybeSingle(),
        supabase.from('bills').select('category,amount,paid').eq('property_id', propertyId).gte('created_at', start).lte('created_at', end),
        supabase.from('bills_settings').select('section,data').eq('property_id', propertyId).in('section', ['providers','insurance','services','common']),
        // Λοιπές δαπάνες: έξοδα του μήνα που ΔΕΝ προέρχονται από λογαριασμό
        // (bill_id null), ώστε να μη διπλομετρηθούν οι λογαριασμοί.
        supabase.from('expenses').select('amount,date,bill_id,expense_group,category').eq('property_id', propertyId).is('bill_id', null).gte('date', start).lte('date', dateEnd),
        supabase.from('bills').select('category,amount,created_at').eq('property_id', propertyId).gte('created_at', histStart),
        supabase.from('expenses').select('amount,date,expense_group,description,category').eq('property_id', propertyId).is('bill_id', null).gte('date', histStart),
        supabase.from('bills').select('category,amount').eq('property_id', propertyId).gte('created_at', `${weekStart}T00:00:00`),
        supabase.from('expenses').select('amount,category,expense_group').eq('property_id', propertyId).is('bill_id', null).gte('date', weekStart),
      ]);

      // ── Έσοδα + δεσμευμένες εκροές (για το «Ασφαλές διαθέσιμο») ──
      const [propRes, loansRes, tenantsRes, staysRes, vaultsRes] = await Promise.all([
        supabase.from('user_properties').select('rental_mode,target_rent,value,year_built,enfia,purchase_price').eq('id', propertyId).maybeSingle(),
        supabase.from('loans').select('amount,rate,years,status').eq('property_id', propertyId),
        supabase.from('tenants').select('monthly_rent,status,move_out_date').eq('property_id', propertyId),
        // Καταλύματα από την αρχή του έτους: το τρέχον μήνα για έσοδα μήνα, το σύνολο YTD
        // για ετησιοποίηση (πρόβλεψη φόρου βραχυχρόνιας χωρίς εποχική στρέβλωση).
        supabase.from('client_stays').select('total,nights,nightly_rate,check_in').eq('property_id', propertyId).gte('check_in', `${y}-01-01`).lte('check_in', dateEnd),
        supabase.from('bills_settings').select('data').eq('property_id', propertyId).eq('section', 'vaults').maybeSingle(),
      ]);
      const rMode = (propRes.data?.rental_mode as 'long_term' | 'short_term' | undefined) ?? '';
      setRentalMode(rMode);
      const stayGross = (st: any) => Number(st.total) || (Number(st.nights) || 0) * (Number(st.nightly_rate) || 0);
      const staysAll  = (staysRes.data ?? []) as any[];
      const staysMonth = staysAll.filter(st => String(st.check_in ?? '') >= start);
      // Έσοδα μήνα: βραχυχρόνια → άθροισμα καταλυμάτων του μήνα· μακροχρόνια → ενεργό
      // ενοίκιο (ή στόχος). Ιδιοκατοίκηση/χωρίς mode → 0 (κανένα «φανταστικό» έσοδο).
      let inc = 0;
      if (rMode === 'short_term') {
        inc = staysMonth.reduce((s: number, st: any) => s + stayGross(st), 0);
        setStrNights(staysMonth.reduce((s: number, st: any) => s + (Number(st.nights) || 0), 0));
      } else if (rMode === 'long_term') {
        // ΜΟΝΟ ενεργοί ενοικιαστές (όχι παλιοί/αποχωρήσαντες) — αλλιώς διπλασιάζεται το έσοδο.
        const rentSum = (tenantsRes.data ?? [])
          .filter((t: any) => t.status !== 'past' && !t.move_out_date)
          .reduce((s: number, t: any) => s + (Number(t.monthly_rent) || 0), 0);
        inc = rentSum > 0 ? rentSum : (Number(propRes.data?.target_rent) || 0);
      }
      setIncome(Math.round(inc));
      // Έσοδα από την αρχή του έτους: βραχυχρόνια → πραγματικά καταλύματα YTD· μακροχρόνια
      // → αναμενόμενο ενοίκιο × μήνες που πέρασαν (δεν καταγράφουμε εισπράξεις εδώ).
      if (rMode === 'short_term') setIncomeYtd(Math.round(staysAll.reduce((s: number, st: any) => s + stayGross(st), 0)));
      else if (rMode === 'long_term') setIncomeYtd(Math.round(inc * (now.getMonth() + 1)));
      else setIncomeYtd(0);
      // Δόση δανείου: ζωντανός υπολογισμός από ενεργά δάνεια (όχι διπλομέτρηση).
      const loanM = (loansRes.data ?? [])
        .filter((l: any) => l.status !== 'inactive' && l.status !== 'closed')
        .reduce((s: number, l: any) => s + annuityMonthly(Number(l.amount) || 0, Number(l.rate) || 0, Number(l.years) || 0), 0);
      setLoanMonthly(Math.round(loanM));
      // Μηνιαίες εισφορές κουμπαράδων — μόνο όσοι έχουν ΜΕΛΛΟΝΤΙΚΗ προθεσμία (mo>0)·
      // ληξιπρόθεσμοι ή χωρίς προθεσμία δεν μετρώνται ως πάγια μηνιαία δέσμευση.
      const vArr = (vaultsRes.data?.data as { vaults?: { target: number; current: number; due?: string }[] } | null)?.vaults ?? [];
      const vaultM = vArr.reduce((s, v) => {
        const mo = monthsUntilDue(v.due);
        return v.due && mo > 0 ? s + reservePlan(Number(v.target) || 0, Number(v.current) || 0, mo).requiredMonthly : s;
      }, 0);
      setVaultMonthly(Math.round(vaultM));

      // Ιστορικά σύνολα ανά μήνα και ανά μήνα/κατηγορία — καθαρά από καταγεγραμμένες
      // εγγραφές (όχι εκτιμήσεις από ρυθμίσεις), ώστε τάση/ετήσιο να είναι έντιμα.
      const mTotals: Record<string, number> = {};
      const cMonth: Record<string, Record<string, number>> = {};
      const addHist = (ym: string, key: string, amt: number) => {
        if (!ym) return;
        mTotals[ym] = (mTotals[ym] ?? 0) + amt;
        (cMonth[ym] ??= {})[key] = (cMonth[ym][key] ?? 0) + amt;
      };
      (histBillsRes.data ?? []).forEach((b: any) => addHist(String(b.created_at ?? '').slice(0, 7), mapCategory(b.category ?? ''), b.amount || 0));
      (histExpRes.data ?? []).forEach((e: any) => addHist(String(e.date ?? '').slice(0, 7), e.expense_group === 'maintenance' ? 'maintenance' : mapCategory(String(e.category ?? '')), e.amount || 0));
      setMonthTotals(mTotals);
      setCatMonth(cMonth);

      // ── Επαναλαμβανόμενες χρεώσεις / συνδρομές: ανάλυση 12μηνου ιστορικού δαπανών ──
      // (καθαρός πυρήνας detectRecurring) — αναδεικνύει «κρυφές» συνδρομές και το ετήσιο βάρος τους.
      const recurTxns = (histExpRes.data ?? [])
        .filter((e: any) => (e.description ?? '').trim().length >= 3)
        .map((e: any) => ({ date: String(e.date ?? '').slice(0, 10), amount: Number(e.amount) || 0, description: String(e.description ?? ''), category: mapCategory(String(e.category ?? '')) }));
      setRecurring(detectRecurring(recurTxns));

      // ── Εβδομαδιαίο εργαλείο: δαπάνες τρέχουσας εβδομάδας ανά κατηγορία ──
      const wk: Record<string, number> = {};
      (weekBillsRes.data ?? []).forEach((b: any) => { const k = mapCategory(String(b.category ?? '')); wk[k] = (wk[k] ?? 0) + (Number(b.amount) || 0); });
      (weekExpRes.data ?? []).forEach((e: any) => { const k = e.expense_group === 'maintenance' ? 'maintenance' : mapCategory(String(e.category ?? '')); wk[k] = (wk[k] ?? 0) + (Number(e.amount) || 0); });
      setWeekActuals(wk);

      if (budgetRes.data?.data) {
        const saved = budgetRes.data.data as Record<string, unknown>;
        setBudgets(prev => { const n = { ...prev }; Object.entries(saved).forEach(([k, v]) => { if (k !== 'participants') n[k] = String(v); }); return n; });
      }

      const billActuals: Record<string, number> = {};
      // Καταγεγραμμένοι λογαριασμοί του μήνα. Άγνωστες κατηγορίες → «Λοιπές δαπάνες»
      // (συνέπεια με τα έξοδα)· δεν χάνεται τίποτα από το σύνολο.
      (billsRes.data ?? []).forEach(b => {
        const key = mapCategory(b.category ?? '');
        billActuals[key] = (billActuals[key] ?? 0) + (b.amount ?? 0);
      });

      const getSett = (sec: string) => settRes.data?.find(x => x.section === sec)?.data as Record<string, unknown> | undefined;
      const prov = getSett('providers');
      if (prov) {
        if (!billActuals.internet) billActuals.internet = (parseFloat(String(prov.internetPrice)) || 0) + (prov.hasTV ? parseFloat(String(prov.tvPrice)) || 0 : 0);
        if (!billActuals.water)    billActuals.water    = prov.waterBiMonthly ? (parseFloat(String(prov.waterBiMonthly)) || 0) / (parseInt(String(prov.waterPeriodMonths)) || 2) : parseFloat(String(prov.waterMonthly)) || 0;
        if (!billActuals.heating)  billActuals.heating  = parseFloat(String(prov.heatingMonthly)) || 0;
      }
      const svc = getSett('services');
      if (svc && !billActuals.services) {
        const enfia = parseFloat(String(svc.enfiaAnnual)) / 12 || parseFloat(String(svc.enfiaMonthly)) || 0;
        const hist  = Array.isArray(svc.dimotikaHistory) ? svc.dimotikaHistory as string[] : [];
        const valid = hist.filter(v => parseFloat(v) > 0);
        billActuals.services = enfia + (valid.length ? valid.reduce((s, v) => s + parseFloat(v), 0) / valid.length : 0);
      }
      const ins = getSett('insurance');
      if (ins && !billActuals.insurance) billActuals.insurance = parseFloat(String(ins.insCustomPrice)) || 0;

      // Έξοδα εκτός λογαριασμών του μήνα: η συντήρηση πάει στη «Συντήρηση»,
      // τα υπόλοιπα στις «Λοιπές δαπάνες» (πιο έντιμη ανάλυση από ένα ενιαίο νούμερο).
      (expRes.data ?? []).forEach((e: any) => {
        const amt = e.amount || 0;
        const k = e.expense_group === 'maintenance' ? 'maintenance' : mapCategory(String(e.category ?? ''));
        billActuals[k] = (billActuals[k] || 0) + amt;
      });

      setActuals(billActuals);

      // ── Έξυπνες προτάσεις αποθεματικών/φόρου (κανονικοί μηχανισμοί, χωρίς απόκλιση) ──
      // Πρόβλεψη φόρου: ετησιοποιημένα μεικτά έσοδα → statement.ts → taxProvision.
      const monthsElapsed = now.getMonth() + 1;
      const annualGross = rMode === 'short_term'
        ? (monthsElapsed > 0 ? Math.round(staysAll.reduce((s, st) => s + stayGross(st), 0) / monthsElapsed * 12) : 0)
        : rMode === 'long_term' ? Math.round(inc * 12) : 0;
      // Λειτουργικά έξοδα ετησιοποιημένα από ΚΑΤΑΓΕΓΡΑΜΜΕΝΟ YTD (ίδια βάση με τα έσοδα)
      // — όχι ένας «μονός» μήνας × 12 που θα στρέβλωνε τον φόρο επιχείρησης από μια αιχμή.
      const yStr2 = String(y) + '-';
      const ytdOpexRec = Object.entries(mTotals).filter(([ym]) => ym.startsWith(yStr2)).reduce((s, [, v]) => s + v, 0);
      const annualOpex = monthsElapsed > 0 && ytdOpexRec > 0
        ? Math.round(ytdOpexRec / monthsElapsed * 12)
        : Math.round(Object.values(billActuals).reduce((s, v) => s + v, 0) * 12);
      // Τόκοι δανείου έτους 1 (εκπίπτουν για επιχείρηση) — από τα ενεργά δάνεια.
      const loanInterestAnnual = (loansRes.data ?? [])
        .filter((l: any) => l.status !== 'inactive' && l.status !== 'closed')
        .reduce((s: number, l: any) => s + interestForYear(Number(l.amount) || 0, Number(l.rate) || 0, Number(l.years) || 0, 1), 0);
      const regime: 'individual_longterm' | 'individual_shortterm' | 'business' =
        isPro ? 'business' : rMode === 'short_term' ? 'individual_shortterm' : 'individual_longterm';
      let taxTargetAnnual = 0, taxPerMonth = 0, taxIsBusiness = false;
      if (annualGross > 0) {
        const stmt = incomeStatement({
          regime, grossIncome: annualGross,
          otherCashExpenses: annualOpex,
          ...(isPro ? { itemizedExpenses: annualOpex, loanInterest: Math.round(loanInterestAnnual) } : {}),
          loanPrincipal: Math.round(loanM * 12),
        });
        taxIsBusiness = isPro;
        // Ιδιώτης: φόρος εισοδήματος. Επιχείρηση: φόρος + προκαταβολή (πραγματική ταμειακή
        // ανάγκη 1ου έτους) — ώστε το αποθεματικό να μην υπολείπεται.
        taxTargetAnnual = Math.round(stmt.incomeTax) + (isPro ? Math.round(stmt.advanceTax) : 0);
        const remain = Math.max(1, 12 - monthsElapsed + 1);
        taxPerMonth = Math.ceil(taxTargetAnnual / remain);
      }
      // Προτεινόμενα αποθεματικά (CapEx/κενές περίοδοι) με βάση ενοίκιο, αξία και παλαιότητα.
      const propValue = Number(propRes.data?.value) || 0;
      const yearBuilt = Number(propRes.data?.year_built) || 0;
      const ageYears  = yearBuilt > 0 ? Math.max(0, y - yearBuilt) : 20;
      const rentForReserve = rMode === 'short_term' ? Math.round(annualGross / 12) : Math.round(inc);
      const rec = recommendedReserves(rentForReserve, propValue, ageYears);
      const enfiaVal = Number(propRes.data?.enfia) || 0;

      const sugg: VaultSuggestion[] = [];
      if (enfiaVal > 0) sugg.push({ key: 'enfia', name: 'ΕΝΦΙΑ', target: Math.round(enfiaVal), due: nextFeb(), hint: 'δόσεις έως Φεβρουάριο' });
      if (taxTargetAnnual > 0) sugg.push({ key: 'tax', name: taxIsBusiness ? 'Φόρος και προκαταβολή' : 'Φόρος εισοδήματος', target: taxTargetAnnual, hint: `~${taxPerMonth}/μήνα`, note: taxIsBusiness ? 'Περιλαμβάνει προκαταβολή. Ξεχωριστά: ΕΦΚΑ, ΦΠΑ — δες τη Λογιστική' : 'Με τεκμαρτή έκπτωση 5% ενσωματωμένη (χάνεται με είσπραξη μετρητών από το 2026)' });
      if (rec.capExMonthly > 0) sugg.push({ key: 'capex', name: 'Συντήρηση και CapEx', target: rec.capExMonthly * 12, hint: `~${rec.capExMonthly}/μήνα` });
      if (rMode === 'short_term' && rec.vacancyMonthly > 0) sugg.push({ key: 'vacancy', name: 'Κενές περίοδοι', target: rec.vacancyMonthly * 12, hint: `~${rec.vacancyMonthly}/μήνα` });
      setSuggestions(sugg);

      // ── Απόδοση επένδυσης (μόνο επαγγελματίας) — NOI/cap rate/cash-on-cash από τον πυρήνα ──
      if (isPro && annualGross > 0 && (propValue > 0 || (Number(propRes.data?.purchase_price) || 0) > 0)) {
        const purchase = Number(propRes.data?.purchase_price) || propValue;
        const loanBalance = (loansRes.data ?? [])
          .filter((l: any) => l.status !== 'inactive' && l.status !== 'closed')
          .reduce((s: number, l: any) => s + (Number(l.amount) || 0), 0);
        const equity = Math.max(0, purchase - loanBalance);
        setInvReturns(investmentReturns({ annualIncome: annualGross, annualOpEx: annualOpex, annualLoanPayment: Math.round(loanM * 12), purchasePrice: purchase, equityInvested: equity }));
      } else {
        setInvReturns(null);
      }
      // ── Όριο 3+ βραχυχρόνιων (μόνο ιδιώτης) — προειδοποίηση επιχειρηματικής δραστηριότητας ──
      if (!isPro && userId) {
        const { count } = await supabase.from('user_properties').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('rental_mode', 'short_term');
        setStrPropCount(count || 0);
      } else {
        setStrPropCount(0);
      }
    } catch (_) {}
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, isPro, userId]);

  useEffect(() => {
    if (!propertyId) return;
    let mounted = true;
    loadData();
    const ch = supabase
      .channel(`budget_${propertyId}`)
      .on('postgres_changes' as const, { event: '*', schema: 'public', table: 'bills', filter: `property_id=eq.${propertyId}` }, () => { if (mounted) loadData(); })
      .on('postgres_changes' as const, { event: '*', schema: 'public', table: 'bills_settings', filter: `property_id=eq.${propertyId}` }, () => { if (mounted) loadData(); })
      .on('postgres_changes' as const, { event: '*', schema: 'public', table: 'expenses', filter: `property_id=eq.${propertyId}` }, () => { if (mounted) loadData(); })
      .subscribe(s => { if (mounted) setRtOk(s === 'SUBSCRIBED'); });
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [propertyId, loadData]);

  const saveBudgets = useCallback((data: Record<string, string>) => {
    if (!propertyId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await supabase.from('bills_settings').upsert(
          { property_id: propertyId, user_id: userId, section: 'budgets', data },
          { onConflict: 'property_id,section' }
        );
      } finally { setSaving(false); }
    }, 800);
  }, [propertyId, userId]);

  const updateBudget = (key: string, val: string) => {
    const next = { ...budgets, [key]: val };
    setBudgets(next);
    saveBudgets(next);
  };

  // ── Derived numbers ────────────────────────────────────────────────────────
  // Τιμή στόχου με σεβασμό στο ρητό 0 (μηδενικός στόχος ≠ «χωρίς στόχο») — μόνο
  // κενό/άκυρο πέφτει στην προεπιλογή.
  const budgetVal = (raw: string | undefined, def: number) => {
    const p = parseFloat(raw ?? '');
    return raw != null && raw.trim() !== '' && !isNaN(p) ? p : def;
  };
  // ── Προσαρμόσιμες κατηγορίες: ο χρήστης κρύβει όσες δεν χρειάζεται και προσθέτει δικές του.
  const parseArr = (s?: string): any[] => { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
  const hiddenKeys: string[] = parseArr(budgets.__hidden).map(String);
  const customCats: { key: string; label: string; default: number }[] = parseArr(budgets.__custom)
    .filter((c: any) => c && c.key && c.label).map((c: any) => ({ key: String(c.key), label: String(c.label), default: 0 }));
  const activeCats: { key: string; label: string; default: number }[] = [
    ...CATS.filter(c => !hiddenKeys.includes(c.key)).map(c => ({ key: c.key as string, label: c.label as string, default: c.default as number })),
    ...customCats,
  ];
  const hiddenBaseCats = CATS.filter(c => hiddenKeys.includes(c.key));
  const catDefault    = (key: string) => activeCats.find(c => c.key === key)?.default ?? 0;
  const catBudget     = (key: string) => budgetVal(budgets[key], catDefault(key));
  const masterBudget  = budgetVal(budgets.total, activeCats.reduce((s, c) => s + c.default, 0));
  // Υπερβάσεις ΤΡΕΧΟΝΤΟΣ μήνα (για τις ειδοποιήσεις email) — η προβολή/αλλαγή μήνα
  // χρησιμοποιεί ξεχωριστό displayOver, ώστε οι ειδοποιήσεις να μένουν στον τρέχοντα μήνα.
  const overBudget    = activeCats.filter(c => (actuals[c.key] || 0) > catBudget(c.key));

  // Προσθήκη/απόκρυψη/επαναφορά κατηγορίας (αποθηκεύεται στις ρυθμίσεις budgets).
  const persistCats = (patch: Record<string, string>) => { const next = { ...budgets, ...patch }; setBudgets(next); saveBudgets(next); };
  const addCategory = (label: string) => {
    const name = label.trim().slice(0, 40); if (!name) return;
    // Κανένα διπλότυπο: αν υπάρχει ήδη ενεργή κατηγορία με το ίδιο όνομα, επανάφερε/άφησέ την.
    const norm = (s: string) => s.trim().toLowerCase();
    if (activeCats.some(c => norm(c.label) === norm(name))) return;
    // Αν ταιριάζει με κρυμμένη βασική κατηγορία, απλώς επανάφερέ την (αντί για διπλότυπη custom).
    const hiddenMatch = hiddenBaseCats.find(c => norm(c.label) === norm(name));
    if (hiddenMatch) { restoreCategory(hiddenMatch.key); return; }
    const key = `c_${Date.now().toString(36)}`;
    persistCats({ __custom: JSON.stringify([...customCats.map(c => ({ key: c.key, label: c.label })), { key, label: name }]), [key]: '0' });
  };
  const removeCategory = (key: string) => {
    if (customCats.some(c => c.key === key)) persistCats({ __custom: JSON.stringify(customCats.filter(c => c.key !== key).map(c => ({ key: c.key, label: c.label }))) });
    else persistCats({ __hidden: JSON.stringify([...hiddenKeys, key]) });
  };
  const restoreCategory = (key: string) => persistCats({ __hidden: JSON.stringify(hiddenKeys.filter(k => k !== key)) });

  // ── Πρόβλεψη τέλους μήνα, ετήσια εικόνα, τάση (καθαρά, από τον πυρήνα) ─────────
  const _now         = new Date();
  const _day         = _now.getDate();
  const _daysInMonth = new Date(_now.getFullYear(), _now.getMonth() + 1, 0).getDate();
  const _curYm       = ymOf(_now);
  const _priorYms    = [1, 2, 3].map(k => ymOf(new Date(_now.getFullYear(), _now.getMonth() - k, 1)));
  // Πρόβλεψη ανά κατηγορία: σταθερές ως έχουν, μεταβλητές με γραμμική προβολή.
  const catForecast  = (key: string) =>
    FIXED_CATS.includes(key) ? (actuals[key] || 0) : forecastMonthEnd(0, actuals[key] || 0, _day, _daysInMonth);
  const fixedToDate    = FIXED_CATS.reduce((s, k) => s + (actuals[k] || 0), 0);
  const variableToDate = (actuals.maintenance || 0) + (actuals.other || 0);
  const forecastTotal  = forecastMonthEnd(fixedToDate, variableToDate, _day, _daysInMonth);
  // Κατηγορίες που, με τον τρέχοντα ρυθμό, θα ξεπεράσουν τον στόχο (χωρίς να είναι ήδη).
  const projectedOver  = activeCats.filter(c => categoryStatus(catBudget(c.key), actuals[c.key] || 0, catForecast(c.key)) === 'projected_over');

  // Ετήσια: πραγματικά YTD από καταγεγραμμένες εγγραφές (bills + λοιπές δαπάνες).
  const _yStr        = String(_now.getFullYear()) + '-';
  const ytdActual    = Object.entries(monthTotals).filter(([ym]) => ym.startsWith(_yStr)).reduce((s, [, v]) => s + v, 0);
  const annual       = annualSummary(masterBudget, ytdActual, _now.getMonth() + 1);
  // Τάση μήνα: τρέχον καταγεγραμμένο σύνολο έναντι μέσου όρου 3 προηγούμενων.
  const monthTrend   = periodTrend(monthTotals[_curYm] || 0, _priorYms.map(ym => monthTotals[ym] || 0));
  // Τάση ανά κατηγορία: ΚΑΤΑΓΕΓΡΑΜΜΕΝΟ τρέχον (όχι εκτιμήσεις παρόχων) έναντι
  // καταγεγραμμένου ιστορικού — ίδια βάση με τη μηνιαία τάση, ώστε να μη βγαίνει
  // ψεύτικο βελάκι από εκτίμηση σε πάγια κατηγορία που δεν έχει χρεωθεί ακόμη.
  const catTrend     = (key: string) => periodTrend(catMonth[_curYm]?.[key] || 0, _priorYms.map(ym => catMonth[ym]?.[key] || 0));
  // Σειρά 12 μηνών (παλαιότερος → τρέχων) ανά κατηγορία, για το μικρογράφημα τάσης.
  const _sparkYms    = Array.from({ length: 12 }, (_, i) => ymOf(new Date(_now.getFullYear(), _now.getMonth() - (11 - i), 1)));
  const catSpark     = (key: string) => _sparkYms.map(ym => catMonth[ym]?.[key] || 0);

  // ── Ετήσιο εργαλείο: ράβδοι ανά μήνα (ημερολογιακό έτος) + κατανομή ανά κατηγορία (YTD) ──
  const _curYear   = _now.getFullYear();
  const _yPrefix   = `${_curYear}-`;
  const yearBars   = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(_curYear, i, 1);
    return { ym: ymOf(d), label: d.toLocaleDateString('el-GR', { month: 'short' }).replace('.', ''), value: monthTotals[ymOf(d)] || 0 };
  });
  const catYtd     = activeCats
    .map(c => ({ label: c.label, value: Object.entries(catMonth).filter(([ym]) => ym.startsWith(_yPrefix)).reduce((s, [, m]) => s + (m[c.key] || 0), 0) }))
    .filter(x => x.value > 0);

  // ── Εβδομαδιαίο εργαλείο: δαπάνες αυτής της εβδομάδας ανά κατηγορία ──
  const weekCats   = activeCats.map(c => ({ label: c.label, value: weekActuals[c.key] || 0 })).filter(x => x.value > 0).sort((a, b) => b.value - a.value);
  const weekTotalV = weekCats.reduce((s, x) => s + x.value, 0);
  const weekMax    = Math.max(1, ...weekCats.map(c => c.value));

  // ── Rollover: αδιάθετο/υπέρβαση προηγούμενου μήνα μεταφέρεται στον τρέχοντα ──
  // Μόνο όταν υπάρχει καταγεγραμμένη δραστηριότητα τον προηγ. μήνα (αλλιώς «κενός»
  // μήνας θα έδειχνε ολόκληρο τον στόχο ως μεταφορά — παραπλανητικό).
  // Το rollover είναι ΕΠΙΛΟΓΗ του χρήστη (όχι δεδομένο) — κάποιοι θέλουν κάθε μήνα
  // «καθαρό» μηδενισμό, άλλοι σωρευτική μεταφορά. Ενεργοποιείται στους Στόχους.
  const rolloverOn    = budgets.rollover === 'true';
  const _prevYm       = _priorYms[0];
  const hasPrevMonth  = _prevYm in monthTotals;
  const carryIn       = hasPrevMonth ? rolloverNext(masterBudget, monthTotals[_prevYm] || 0).carryOut : 0;
  // «Πραγματικά διαθέσιμα» σε ΚΑΤΑΓΕΓΡΑΜΜΕΝΗ βάση και για τους δύο μήνες (η μεταφορά
  // υπολογίζεται από καταγεγραμμένα σύνολα) — αποφεύγει ανάμειξη με εκτιμήσεις παρόχων.
  const adjAvailable  = masterBudget + carryIn - (monthTotals[_curYm] || 0);
  const _prevLabel    = new Date(_now.getFullYear(), _now.getMonth() - 1, 1).toLocaleDateString('el-GR', { month: 'long' });

  // ── Επιλεγμένος μήνας προβολής (πλοήγηση) ────────────────────────────────────
  // Τρέχων μήνας: ζωντανά actuals (με εκτιμήσεις + πρόβλεψη). Παλαιότερος: ΚΑΤΑΓΕΓΡΑΜΜΕΝΑ
  // σύνολα ανά κατηγορία από το ήδη φορτωμένο 13μηνο ιστορικό — μηδέν νέα ερωτήματα.
  const isCurMonth      = monthOffset === 0;
  const viewDate        = new Date(_now.getFullYear(), _now.getMonth() + monthOffset, 1);
  const viewYm          = ymOf(viewDate);
  const viewActuals     = isCurMonth ? actuals : (catMonth[viewYm] || {});
  const viewActualTotal = activeCats.reduce((s, c) => s + (viewActuals[c.key] || 0), 0);
  const viewMonthLabel  = viewDate.toLocaleDateString('el-GR', { month: 'long', year: 'numeric' });
  const displayOver     = activeCats.filter(c => (viewActuals[c.key] || 0) > catBudget(c.key));
  const canGoNewer      = monthOffset < 0;
  const canGoOlder      = monthOffset > -12;

  // ── «Ασφαλές διαθέσιμο» (Monzo Left to Spend / owner draw) ────────────────────
  // Δεσμευμένοι λογαριασμοί = ΠΡΑΓΜΑΤΙΚΟΙ πάγιοι λογαριασμοί του μήνα (καταγεγραμμένοι
  // + εκτιμήσεις παρόχων), όχι απλώς οι προεπιλεγμένοι στόχοι — αλλιώς εμφανίζεται
  // «φανταστικό» κόστος σε άδειο ακίνητο. Εκροές = δόση + εισφορές κουμπαράδων.
  const committedBills = fixedToDate;
  const monthlyCost    = committedBills + loanMonthly + vaultMonthly;
  const hasIncome      = income > 0;
  const isShortfall    = hasIncome && monthlyCost > income;

  // ── Ειδοποιήσεις υπέρβασης (σύνδεση με το σύστημα υπενθυμίσεων) ──────────────
  // Όταν ενεργό και υπάρχει υπέρβαση, δημιουργείται ΕΝΑ εκκρεμές γεγονός ημερολογίου
  // (source 'budget') τον μήνα — το ημερήσιο cron το στέλνει email μέσω των προτιμήσεων
  // ειδοποιήσεων του χρήστη. Όταν λυθεί η υπέρβαση ή απενεργοποιηθεί, καθαρίζεται.
  const notifyOn  = budgets.notifyOverspend === 'true';
  const overKey   = overBudget.map(c => c.key).sort().join(',');
  // Το μέγεθος της υπέρβασης μπαίνει στις εξαρτήσεις ώστε ένα ποσό που μεγαλώνει
  // (ίδια κατηγορία) να ενημερώνει το αποθηκευμένο γεγονός, όχι μόνο η αλλαγή κατηγοριών.
  const overAmt   = Math.round(overBudget.reduce((s, c) => s + ((actuals[c.key] || 0) - catBudget(c.key)), 0));

  // ── Waterfall εσόδου βραχυχρόνιας: μεικτό → καθαρό (persona: short_term) ──────
  // Παραδοχές (προμήθεια/διαχείριση/φόρος) επεξεργάσιμες· εκτίμηση, όχι λογιστική.
  const isSTR          = rentalMode === 'short_term';
  const strPlatformPct = budgetVal(budgets.strPlatformPct, 15);
  const strMgmtPct     = budgetVal(budgets.strMgmtPct, 0);
  const strTaxPct      = budgetVal(budgets.strTaxPct, 15);
  const waterfall      = isSTR && income > 0
    ? strWaterfall({ gross: income, platformFeePct: strPlatformPct, nights: strNights, climateFeePerNight: climateFeePerNight(_now.getMonth() + 1), cleaningFee: 0, managementPct: strMgmtPct, incomeTaxPct: strTaxPct })
    : null;
  useEffect(() => {
    if (!propertyId || !userId || loading) return;
    let cancelled = false;
    (async () => {
      const y = _now.getFullYear(), mo = _now.getMonth();
      const p2 = (n: number) => String(n).padStart(2, '0');
      const mStart = `${y}-${p2(mo + 1)}-01`;
      const mEnd   = `${y}-${p2(mo + 1)}-${new Date(y, mo + 1, 0).getDate()}`;
      // Διαβάζουμε ΟΛΑ τα φετινομηνιάτικα 'budget' γεγονότα (όχι limit 1) ώστε τυχόν
      // διπλότυπα από ταυτόχρονες εγγραφές να καθαρίζονται αντί να μένουν να στέλνουν email.
      const { data: existing } = await supabase.from('calendar_events')
        .select('id').eq('property_id', propertyId).eq('source', 'budget')
        .gte('event_date', mStart).lte('event_date', mEnd).order('event_date');
      if (cancelled) return;
      const ids = (existing ?? []).map((e: any) => e.id as string).filter(Boolean);
      if (notifyOn && overBudget.length > 0) {
        const total = overBudget.reduce((s, c) => s + ((actuals[c.key] || 0) - catBudget(c.key)), 0);
        const title = `Υπέρβαση προϋπολογισμού: ${overBudget.map(c => c.label).join(', ')}`;
        if (ids.length > 0) {
          await supabase.from('calendar_events').update({ title, amount: Math.round(total) }).eq('id', ids[0]);
          if (ids.length > 1 && !cancelled) await supabase.from('calendar_events').delete().in('id', ids.slice(1));
        } else if (!cancelled) {
          await supabase.from('calendar_events').insert({
            property_id: propertyId, user_id: userId, title, category: 'financial',
            event_date: `${y}-${p2(mo + 1)}-${p2(_now.getDate())}`, priority: 'high',
            status: 'pending', source: 'budget', amount: Math.round(total), recurring: false,
          });
        }
      } else if (ids.length > 0) {
        await supabase.from('calendar_events').delete().in('id', ids);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, userId, loading, notifyOn, overKey, overAmt]);

  // Κεφαλίδα ενότητας με προαιρετικό κουμπί ελαχιστοποίησης (chevron) και δεξί περιεχόμενο.
  const secHdr = (label: string, key?: string, right?: React.ReactNode, info?: React.ReactNode) => {
    const shut = !!key && collapsed.has(key);
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: shut ? 0 : 13, paddingBottom: shut ? 0 : 10, borderBottom: shut ? 'none' : '1px solid var(--border-subtle)' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: T.font.sans }}>{label}</span>
        {info}
        <span style={{ flex: 1 }}/>
        {right}
        {key && (
          <button onClick={() => toggleCollapse(key)} aria-label={shut ? 'Άνοιγμα' : 'Ελαχιστοποίηση'} title={shut ? 'Άνοιγμα' : 'Ελαχιστοποίηση'}
            style={{ display: 'flex', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 4, margin: '-4px -4px -4px 0' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: shut ? 'rotate(-90deg)' : 'none', transition: 'transform 0.18s' }}><polyline points="6 9 12 15 18 9"/></svg>
          </button>
        )}
      </div>
    );
  };

  // Ενιαίος διακόπτης ρύθμισης (ίδιο idiom με τα toggles της εφαρμογής).
  const settingToggle = (settingKey: string, on: boolean, title: string, desc: string) => (
    <button onClick={() => updateBudget(settingKey, on ? 'false' : 'true')}
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', background: 'var(--bg-elevated)', border: `1px solid ${on ? 'var(--border-accent)' : 'var(--border-subtle)'}`, borderRadius: T.radius.inner, cursor: 'pointer', textAlign: 'left', fontFamily: T.font.sans }}>
      <span style={{ position: 'relative', width: 38, height: 22, borderRadius: 11, background: on ? 'var(--accent)' : 'var(--border-default)', flexShrink: 0, transition: 'background 0.2s' }}>
        <span style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }}/>
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</span>
        <span style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{desc}</span>
      </span>
    </button>
  );

  if (loading) return <Spinner label="Φόρτωση…" />;

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>Προϋπολογισμός</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
            {!editMode && (
              <button onClick={() => canGoOlder && setMonthOffset(o => o - 1)} disabled={!canGoOlder} aria-label="Προηγούμενος μήνας"
                style={{ display: 'flex', border: 'none', background: 'transparent', cursor: canGoOlder ? 'pointer' : 'default', color: canGoOlder ? 'var(--text-secondary)' : 'var(--border-default)', padding: 2, margin: '0 -2px' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
            )}
            <span style={{ minWidth: 96, textAlign: !editMode ? 'center' : 'left', textTransform: 'capitalize' }}>{editMode ? new Date().toLocaleDateString('el-GR', { month: 'long', year: 'numeric' }) : viewMonthLabel}</span>
            {!editMode && (
              <button onClick={() => canGoNewer && setMonthOffset(o => o + 1)} disabled={!canGoNewer} aria-label="Επόμενος μήνας"
                style={{ display: 'flex', border: 'none', background: 'transparent', cursor: canGoNewer ? 'pointer' : 'default', color: canGoNewer ? 'var(--text-secondary)' : 'var(--border-default)', padding: 2, margin: '0 -2px' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            )}
            {!isCurMonth && <button onClick={() => setMonthOffset(0)} style={{ marginLeft: 4, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--accent)', cursor: 'pointer', fontSize: 10, fontWeight: 600, borderRadius: T.radius.pill, padding: '2px 9px', fontFamily: T.font.sans }}>Τρέχων</button>}
            <span style={{ marginLeft: 8, color: 'var(--text-tertiary)' }}>· {isPro ? 'Επιχείρηση' : 'Ιδιώτης'}</span>
            {saving && <span style={{ marginLeft: 10, color: 'var(--text-tertiary)', fontSize: 11 }}>· Αποθήκευση…</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setEditMode(v => !v)}
            style={{ padding: '7px 16px', fontSize: 11, fontWeight: 600, borderRadius: T.radius.btn, border: `1px solid ${editMode ? 'var(--accent)' : 'var(--border-default)'}`, background: editMode ? 'var(--accent-dim)' : 'transparent', color: editMode ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', fontFamily: T.font.sans }}>
            {editMode ? 'Αποθήκευση' : 'Ορισμός Στόχων'}
          </button>
        </div>
      </div>

      {/* «Ασφαλές διαθέσιμο» — έσοδα − δεσμευμένα − εισφορές (Monzo Left to Spend) */}
      {!editMode && isCurMonth && (hasIncome || monthlyCost > 0) && (() => {
        const safeRaw = income - monthlyCost;
        const val = hasIncome ? safeRaw : monthlyCost;
        const numCol = !hasIncome ? 'var(--text-primary)' : safeRaw < 0 ? 'var(--negative)' : heroHover ? 'var(--accent)' : 'var(--text-primary)';
        const seg = (v: number) => income > 0 ? Math.max(0, Math.min(100, (v / income) * 100)) : 0;
        return (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div onMouseEnter={() => setHeroHover(true)} onMouseLeave={() => setHeroHover(false)} onTouchStart={() => setHeroHover(true)} onTouchEnd={() => setHeroHover(false)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: T.font.sans }}>{hasIncome ? (isPro ? 'Διαθέσιμη ταμειακή ροή' : 'Ασφαλές διαθέσιμο') : 'Μηνιαίο κόστος ακινήτου'}</span>
                  <InfoDot text={hasIncome ? (isPro ? 'Έσοδα μείον τους δεσμευμένους λογαριασμούς, τη δόση του δανείου και τις εισφορές των αποθεματικών. Δηλαδή η ελεύθερη ταμειακή ροή της δραστηριότητας κάθε μήνα.' : 'Έσοδα μείον τους δεσμευμένους λογαριασμούς, τη δόση του δανείου και τις μηνιαίες εισφορές των κουμπαράδων. Το ποσό που μπορείς με ασφάλεια να αποσύρεις ή να διαθέσεις κάθε μήνα.') : 'Το άθροισμα των πάγιων λογαριασμών, της δόσης του δανείου και των εισφορών των κουμπαράδων. Δηλαδή τι σου κοστίζει το ακίνητο κάθε μήνα.'} />
                </div>
                <div style={{ fontSize: 30, fontWeight: 700, color: numCol, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', lineHeight: 1, letterSpacing: '-0.02em', transition: 'color 0.15s' }}>{fe(val, 0)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6, fontFamily: T.font.sans }}>{hasIncome ? 'μετά από λογαριασμούς, δόση και κουμπαράδες' : 'λογαριασμοί, δόση και κουμπαράδες'}</div>
              </div>
            </div>
            {hasIncome && (
              <>
                <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 16, marginBottom: 10, background: 'var(--bg-overlay)' }}>
                  <div title="Λογαριασμοί" style={{ width: `${seg(committedBills)}%`, background: 'color-mix(in srgb, var(--text-primary) 32%, transparent)' }}/>
                  <div title="Δόση δανείου" style={{ width: `${seg(loanMonthly)}%`, background: 'color-mix(in srgb, var(--text-primary) 20%, transparent)' }}/>
                  <div title="Κουμπαράδες" style={{ width: `${seg(vaultMonthly)}%`, background: 'color-mix(in srgb, var(--text-primary) 12%, transparent)' }}/>
                  <div title="Διαθέσιμο" style={{ flex: 1, background: safeRaw < 0 ? 'var(--negative)' : 'var(--accent)' }}/>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 10.5, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>
                  {[
                    { l: 'Έσοδα', v: income },
                    { l: 'Λογαριασμοί', v: committedBills },
                    { l: 'Δόση', v: loanMonthly },
                    { l: 'Κουμπαράδες', v: vaultMonthly },
                    { l: 'Διαθέσιμο', v: safeRaw },
                  ].filter(x => x.v !== 0).map(x => (
                    <span key={x.l} style={{ fontVariantNumeric: 'tabular-nums' }}>{x.l} <strong style={{ color: 'var(--text-primary)', fontFamily: T.font.num }}>{fe(x.v, 0)}</strong></span>
                  ))}
                </div>
                {isShortfall && (
                  <div style={{ marginTop: 12, fontSize: 11.5, color: 'var(--negative)', fontFamily: T.font.sans }}>Τα δεσμευμένα έξοδα ξεπερνούν τα έσοδα κατά {fe(monthlyCost - income, 0)}. Μείωσε τις εισφορές των κουμπαράδων ή αναθεώρησε τους στόχους.</div>
                )}
              </>
            )}
          </div>
        );
      })()}

      {/* Έσοδα / rent-roll — αναμενόμενα ή πραγματικά έσοδα ακινήτου (προσαρμόζεται στον τύπο μίσθωσης) */}
      {!editMode && isCurMonth && income > 0 && (() => {
        const isSTRmode = rentalMode === 'short_term';
        const netFlow = income - monthlyCost;
        return (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 16, marginBottom: 12 }}>
            {secHdr('Έσοδα', 'income', undefined,
              <InfoDot text={isSTRmode
                ? 'Πραγματικά έσοδα από τα καταλύματα: του μήνα, από την αρχή του έτους, διανυκτερεύσεις και μέση τιμή ανά βραδιά.'
                : 'Αναμενόμενο ενοίκιο από τους ενεργούς ενοικιαστές: μηνιαίο, ετήσιο και η καθαρή ταμειακή ροή μετά τα μηνιαία κόστη του ακινήτου.'} />)}
            {!collapsed.has('income') && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 128px), 1fr))', gap: 8 }}>
                {isSTRmode ? (
                  <>
                    <KPI label="Έσοδα μήνα" value={fe(income, 0)} />
                    <KPI label="Από την αρχή έτους" value={fe(incomeYtd, 0)} title="Πραγματικά έσοδα καταλυμάτων από 1η Ιανουαρίου." />
                    <KPI label="Διανυκτερεύσεις" value={String(strNights)} />
                    <KPI label="Μέση τιμή / βραδιά" value={strNights > 0 ? fe(Math.round(income / strNights), 0) : '—'} />
                  </>
                ) : (
                  <>
                    <KPI label="Μηνιαίο ενοίκιο" value={fe(income, 0)} />
                    <KPI label="Ετησίως" value={fe(income * 12, 0)} />
                    <KPI label="Αναμενόμενα φέτος" value={fe(incomeYtd, 0)} title="Μηνιαίο ενοίκιο × μήνες που πέρασαν φέτος (αναμενόμενα, όχι καταγεγραμμένες εισπράξεις)." />
                    <KPI label="Καθαρή ροή" value={`${netFlow < 0 ? '−' : ''}${fe(Math.abs(netFlow), 0)}`} color={netFlow < 0 ? 'var(--negative)' : undefined} title="Έσοδα μείον μηνιαία κόστη (λογαριασμοί, δόση, κουμπαράδες)." />
                  </>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Waterfall εσόδου βραχυχρόνιας — από μεικτό σε καθαρό (μόνο short_term) */}
      {isCurMonth && isSTR && waterfall && (() => {
        const rows = [
          { l: 'Μεικτό έσοδο', v: waterfall.gross, sub: false },
          { l: 'Προμήθεια πλατφόρμας', v: -waterfall.platformFee, sub: true },
          { l: 'Τέλος ανθεκτικότητας', v: -waterfall.climateFee, sub: true },
          ...(waterfall.management > 0 ? [{ l: 'Διαχείριση', v: -waterfall.management, sub: true }] : []),
          { l: 'Κράτηση φόρου (εκτίμηση)', v: -waterfall.taxReserve, sub: true },
        ];
        return (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: T.font.sans }}>Από μεικτό σε καθαρό</span>
              <InfoDot text="Ανάλυση του εσόδου βραχυχρόνιας μίσθωσης του μήνα: αφαιρούνται η προμήθεια της πλατφόρμας, το τέλος ανθεκτικότητας (ανά διανυκτέρευση), η τυχόν διαχείριση και η εκτιμώμενη κράτηση φόρου, για να δεις τι μένει πραγματικά. Πρόκειται για εκτίμηση· μπορείς να προσαρμόσεις τις παραδοχές στην επεξεργασία." />
              {editMode && <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-tertiary)' }}>{strNights} διαν.</span>}
            </div>

            {editMode ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 10 }}>
                <NumberInput label="Προμήθεια πλατφόρμας" value={budgets.strPlatformPct ?? '15'} onChange={v => updateBudget('strPlatformPct', v)} suffix="%" step={1} placeholder="15"/>
                <NumberInput label="Διαχείριση / co-host" value={budgets.strMgmtPct ?? '0'} onChange={v => updateBudget('strMgmtPct', v)} suffix="%" step={1} placeholder="0"/>
                <NumberInput label="Συντελεστής φόρου" value={budgets.strTaxPct ?? '15'} onChange={v => updateBudget('strTaxPct', v)} suffix="%" step={1} placeholder="15"/>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {rows.map((r, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12.5, fontFamily: T.font.sans, color: r.sub ? 'var(--text-secondary)' : 'var(--text-primary)', fontWeight: r.sub ? 400 : 600 }}>
                      <span>{r.l}</span>
                      <span style={{ fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', color: r.v < 0 ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>{r.v < 0 ? '−' : ''}{fe(Math.abs(r.v), 0)}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4, paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.sans }}>Καθαρό</span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{fe(waterfall.net, 0)}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginTop: 12, fontSize: 10.5, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
                  <span>Καθαρό / διανυκτέρευση <strong style={{ color: 'var(--text-secondary)', fontFamily: T.font.num }}>{fe(waterfall.netPerNight, 0)}</strong></span>
                  <span>Περιθώριο <strong style={{ color: 'var(--text-secondary)', fontFamily: T.font.num }}>{waterfall.marginPct}%</strong></span>
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* Over-budget alerts */}
      {!editMode && displayOver.length > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {displayOver.map(cat => {
            const budget = catBudget(cat.key);
            const actual = viewActuals[cat.key] || 0;
            return (
              <div key={cat.key} style={{ background: 'var(--negative-dim)', border: '1px solid var(--negative-border)', borderRadius: T.radius.inner, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--negative)', flexShrink: 0 }}/>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--negative)', fontFamily: T.font.sans }}>{cat.label}</span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>υπέρβαση</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--negative)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>+{fe(actual - budget, 0)}</span>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>({fe(actual, 0)} vs {fe(budget, 0)})</span>
              </div>
            );
          })}
          {notifyOn && isCurMonth && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 10.5, color: 'var(--text-tertiary)', fontFamily: T.font.sans, paddingLeft: 2 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
              Θα λάβεις υπενθύμιση μέσω email και στο Ημερολόγιο.
            </div>
          )}
        </div>
      )}

      {/* Προβλεπόμενη υπέρβαση — με τον τρέχοντα ρυθμό (προειδοποίηση, όχι ήδη υπέρβαση) */}
      {!editMode && isCurMonth && projectedOver.length > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: T.radius.inner, padding: '10px 16px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><path d="M23 6l-9.5 9.5-5-5L1 18"/><polyline points="17 6 23 6 23 12"/></svg>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.5 }}>
            Με τον τρέχοντα ρυθμό, θα ξεπεραστεί ο στόχος σε: <strong style={{ color: 'var(--text-primary)' }}>{projectedOver.map(c => c.label).join(', ')}</strong>
          </span>
        </div>
      )}

      {/* Όριο 3+ βραχυχρόνιων (ΜΟΝΟ ιδιώτης) — νομικό κατώφλι επιχειρηματικής δραστηριότητας */}
      {!editMode && !isPro && strPropCount >= 3 && (
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: T.radius.inner, padding: '10px 16px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.5 }}>
            Έχεις <strong style={{ color: 'var(--text-primary)' }}>{strPropCount} βραχυχρόνια ακίνητα</strong>. Από 3 και πάνω, η δραστηριότητα θεωρείται επιχειρηματική και προκύπτουν υποχρεώσεις ΦΠΑ, ΕΦΚΑ και προκαταβολής φόρου. Συμβουλέψου τη Λογιστική και τον λογιστή σου.
          </span>
        </div>
      )}

      {/* Ο μήνας — μετρικές + πρόοδος σε ΕΝΑ πλαίσιο (χωρίς διπλότυπη κάρτα «Σύνολο») */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 16, marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 128px), 1fr))', gap: 8, marginBottom: editMode ? 0 : 12 }}>
          <KPI label="Στόχος / μήνα" value={fe(masterBudget, 0)} />
          <KPI label={isCurMonth ? 'Έως τώρα' : 'Σύνολο μήνα'} value={fe(viewActualTotal, 0)} title={isCurMonth ? 'Καταγεγραμμένα του μήνα συν εκτιμήσεις παρόχων για πάγιες κατηγορίες που δεν έχουν χρεωθεί ακόμη.' : 'Καταγεγραμμένες δαπάνες αυτού του μήνα από το ιστορικό.'} />
          {isCurMonth
            ? <KPI label="Πρόβλεψη μήνα" value={fe(forecastTotal, 0)} />
            : <KPI label="Έναντι στόχου" value={`${viewActualTotal <= masterBudget ? '−' : '+'}${fe(Math.abs(masterBudget - viewActualTotal), 0)}`} />}
          <KPI label="Διαθέσιμο" value={fe(Math.max(0, masterBudget - viewActualTotal))} />
        </div>
        {!editMode && (() => {
          const pct    = masterBudget > 0 ? Math.min((viewActualTotal / masterBudget) * 100, 100) : 0;
          const isOver = viewActualTotal > masterBudget;
          const col    = isOver ? 'var(--negative)' : 'color-mix(in srgb, var(--text-primary) 34%, transparent)';
          return (
            <>
              <div style={{ height: 6, background: 'var(--bg-overlay)', borderRadius: 3, overflow: 'hidden', marginBottom: 7 }}>
                <div style={{ height: '100%', width: `${pct}%`, background: col, borderRadius: 3, transition: 'width 0.6s ease' }}/>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
                <span style={{ color: 'var(--text-tertiary)', fontWeight: 700 }}>{pct.toFixed(0)}% χρησιμοποιήθηκε</span>
                {/* Το «Απομένει» φαίνεται ήδη στο πλακίδιο «Διαθέσιμο» — εδώ μόνο η υπέρβαση. */}
                <span style={{ color: isOver ? 'var(--negative)' : 'var(--text-tertiary)' }}>{isOver ? `Υπέρβαση ${fe(viewActualTotal - masterBudget, 0)}` : ''}</span>
              </div>
              {isCurMonth && rolloverOn && hasPrevMonth && carryIn !== 0 && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-subtle)', fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>
                  Μεταφορά από {_prevLabel}: <strong style={{ color: carryIn > 0 ? 'var(--text-primary)' : 'var(--negative)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{carryIn > 0 ? '+' : ''}{fe(carryIn, 0)}</strong>
                  {' · '}πραγματικά διαθέσιμα <strong style={{ color: adjAvailable < 0 ? 'var(--negative)' : 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{fe(adjAvailable, 0)}</strong>
                </div>
              )}
            </>
          );
        })()}
      </div>

      {/* Απόδοση επένδυσης — ΜΟΝΟ επαγγελματίας (NOI/cap rate/cash-on-cash), δίπλα στα βασικά νούμερα */}
      {!editMode && isPro && invReturns && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 16, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12, paddingBottom: 9, borderBottom: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: T.font.sans }}>Απόδοση επένδυσης</span>
            <InfoDot text="NOI = καθαρά λειτουργικά έσοδα (χωρίς δόση δανείου). Ταμειακή ροή = NOI μείον δόση. Cap rate = NOI / τιμή αγοράς. Cash-on-cash = ταμειακή ροή / ίδια κεφάλαια. Ετησιοποιημένες εκτιμήσεις." />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 128px), 1fr))', gap: 8 }}>
            <KPI label="NOI / έτος" value={fe(invReturns.noi, 0)} />
            <KPI label="Ταμειακή ροή" value={fe(invReturns.preTaxCashFlow, 0)} color={invReturns.preTaxCashFlow < 0 ? 'var(--negative)' : undefined} />
            <KPI label="Cap rate" value={`${invReturns.capRatePct.toLocaleString('el-GR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`} />
            <KPI label="Cash-on-cash" value={`${invReturns.cashOnCashPct.toLocaleString('el-GR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`} />
          </div>
        </div>
      )}

      {/* Ετήσια εικόνα — YTD και προβολή τέλους έτους από καταγεγραμμένες εγγραφές */}
      {!editMode && (() => {
        const ytdPct = annual.ytdBudget > 0 ? Math.min((annual.ytdActual / annual.ytdBudget) * 100, 100) : 0;
        const ytdOver = annual.ytdActual > annual.ytdBudget;
        const ytdCol = ytdOver ? 'var(--negative)' : 'color-mix(in srgb, var(--text-primary) 34%, transparent)';
        const trDir = monthTrend.direction;
        const shut = collapsed.has('annual');
        return (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 16, marginBottom: 12 }}>
            {secHdr('Ετήσια εικόνα', 'annual')}
            {!shut && (
              <>
                {/* Προβολή τέλους έτους — κύριος αριθμός */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                  <span style={{ fontSize: 26, fontWeight: 700, color: annual.onTrack ? 'var(--text-primary)' : 'var(--negative)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', lineHeight: 1, letterSpacing: '-0.02em' }}>{fe(annual.projectedYearEnd, 0)}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>προβολή τέλους έτους · στόχος <span style={{ fontFamily: T.font.num }}>{fe(annual.annualBudget, 0)}</span></span>
                  <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, padding: '3px 10px', borderRadius: T.radius.pill, fontFamily: T.font.sans, color: annual.onTrack ? 'var(--text-secondary)' : 'var(--negative)', background: annual.onTrack ? 'var(--bg-elevated)' : 'var(--negative-dim)', border: `1px solid ${annual.onTrack ? 'var(--border-subtle)' : 'var(--negative-border)'}` }}>{annual.onTrack ? 'Εντός στόχου' : 'Εκτός στόχου'}</span>
                </div>
                {/* YTD — από την αρχή του έτους */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7, fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>
                  <span>Από την αρχή του έτους</span>
                  <span style={{ fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{fe(annual.ytdActual, 0)} <span style={{ color: 'var(--text-tertiary)' }}>/ {fe(annual.ytdBudget, 0)}</span></span>
                </div>
                <div style={{ height: 8, background: 'var(--bg-overlay)', borderRadius: 4, overflow: 'hidden', marginBottom: 7 }}>
                  <div style={{ height: '100%', width: `${ytdPct}%`, background: ytdCol, borderRadius: 4, transition: 'width 0.6s ease' }}/>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10.5, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
                  <span style={{ color: annual.variance > 0 ? 'var(--negative)' : 'var(--text-tertiary)' }}>{annual.variance > 0 ? `Υπέρβαση ${fe(annual.variance, 0)} έναντι στόχου` : `Εντός στόχου κατά ${fe(-annual.variance, 0)}`}</span>
                  {monthTrend.avgPrior > 0 && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: trDir === 'up' ? 'var(--negative)' : 'var(--text-tertiary)' }}>
                      {trDir === 'flat'
                        ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: trDir === 'down' ? 'scaleY(-1)' : 'none' }}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>}
                      {trDir === 'flat' ? 'σταθερά' : `${monthTrend.deltaPct > 0 ? '+' : ''}${monthTrend.deltaPct}% vs τρίμηνο`}
                    </span>
                  )}
                </div>
                {/* Ετήσιο εργαλείο: ράβδοι εξόδων ανά μήνα (με ήπια κατάσταση όταν δεν υπάρχει ιστορικό) */}
                <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12, fontFamily: T.font.sans }}>Έξοδα ανά μήνα</div>
                  {yearBars.some(b => b.value > 0)
                    ? <MonthBars data={yearBars} activeYm={_curYm} />
                    : <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', fontFamily: T.font.sans, padding: '14px 0' }}>Μόλις καταγραφούν έξοδα, θα δεις εδώ την πορεία ανά μήνα.</div>}
                </div>
                {/* Ετήσιο εργαλείο: κατανομή δαπανών ανά κατηγορία */}
                {catYtd.length > 0 && (
                  <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12, fontFamily: T.font.sans }}>Κατανομή ανά κατηγορία</div>
                    <Donut slices={catYtd} />
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}

      {/* Εβδομαδιαίο εργαλείο — δαπάνες αυτής της εβδομάδας ανά κατηγορία (μόνο τρέχων μήνας) */}
      {!editMode && isCurMonth && weekTotalV > 0 && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 16, marginBottom: 12 }}>
          {secHdr('Αυτή την εβδομάδα', 'week', <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{fe(weekTotalV, 0)}</span>)}
          {!collapsed.has('week') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {weekCats.map(c => {
                const on = hoverWeek === c.label;
                return (
                <div key={c.label} onMouseEnter={() => setHoverWeek(c.label)} onMouseLeave={() => setHoverWeek(null)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 6px', margin: '0 -6px', borderRadius: T.radius.inner, background: on ? 'var(--bg-elevated)' : 'transparent', transition: 'background 0.15s' }}>
                  <span style={{ width: 120, flexShrink: 0, fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', fontFamily: T.font.sans, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
                  <div style={{ flex: 1, height: 8, background: 'var(--bg-overlay)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(c.value / weekMax) * 100}%`, background: `color-mix(in srgb, var(--text-primary) ${on ? 52 : 30}%, transparent)`, borderRadius: 4, transition: 'width 0.5s ease, background 0.18s' }} />
                  </div>
                  <span style={{ width: 62, textAlign: 'right', flexShrink: 0, fontSize: 12.5, fontWeight: 700, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', color: on ? 'var(--accent)' : 'var(--text-primary)', transition: 'color 0.15s' }}>{fe(c.value, 0)}</span>
                </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Επιχειρηματικές υποχρεώσεις — ΜΟΝΟ επαγγελματίας (δεν αφορούν ιδιώτες) */}
      {!editMode && isPro && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '12px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: T.font.sans }}>Επιχειρηματικές υποχρεώσεις</span>
          <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.55 }}>
            Εκτός από τον φόρο εισοδήματος, ως επιχείρηση βαρύνεσαι με τις μηνιαίες εισφορές <strong style={{ color: 'var(--text-secondary)' }}>ΕΦΚΑ</strong>, την <strong style={{ color: 'var(--text-secondary)' }}>προκαταβολή φόρου</strong> για την επόμενη χρήση και, εφόσον παρέχεις υπηρεσίες, τον <strong style={{ color: 'var(--text-secondary)' }}>ΦΠΑ</strong>. Τα ακριβή ποσά υπολογίζονται στη Λογιστική.
          </span>
        </div>
      )}

      {/* Επαναλαμβανόμενες χρεώσεις / συνδρομές — ανάλυση 12μηνου ιστορικού δαπανών */}
      {!editMode && recurring.length > 0 && (() => {
        const monthlyTotal = recurring.reduce((s, r) => s + r.monthlyEquivalent, 0);
        const annualTotal  = recurring.reduce((s, r) => s + r.annualCost, 0);
        const cadLabel = (c: RecurringCharge['cadence']) => c === 'monthly' ? 'μηνιαία' : c === 'bimonthly' ? 'διμηνιαία' : c === 'quarterly' ? 'τριμηνιαία' : c === 'yearly' ? 'ετήσια' : 'ακανόνιστη';
        return (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 16, marginBottom: 12 }}>
            {secHdr('Επαναλαμβανόμενες χρεώσεις', 'recurring',
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{fe(monthlyTotal, 0)}/μήνα · {fe(annualTotal, 0)}/έτος</span>,
              <InfoDot text="Συνδρομές και πάγιες χρεώσεις που εντοπίζονται αυτόματα από τις καταγεγραμμένες δαπάνες σου, όταν ο ίδιος πάροχος επαναλαμβάνεται σε πολλούς μήνες. Δείχνει συχνότητα, τυπικό ποσό και ετήσιο κόστος, ώστε να εντοπίζεις εύκολα τις «κρυφές» συνδρομές." />)}
            {!collapsed.has('recurring') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {recurring.slice(0, 10).map(r => {
                  const hov = hoverRec === r.key;
                  return (
                    <div key={r.key} onMouseEnter={() => setHoverRec(r.key)} onMouseLeave={() => setHoverRec(null)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px', margin: '0 -8px', borderRadius: T.radius.inner, background: hov ? 'var(--bg-elevated)' : 'transparent', transition: 'background 0.15s' }}>
                      <div style={{ width: 3, height: 24, borderRadius: 2, background: 'color-mix(in srgb, var(--text-primary) 26%, transparent)', flexShrink: 0 }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', fontFamily: T.font.sans, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 1 }}>{cadLabel(r.cadence)} · επόμενη {parseLocalDate(r.nextExpected).toLocaleDateString('el-GR', { day: 'numeric', month: 'short' })}</div>
                      </div>
                      <div style={{ textAlign: 'right', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: hov ? 'var(--accent)' : 'var(--text-primary)', transition: 'color 0.15s' }}>{fe(r.monthlyEquivalent, 0)}<span style={{ fontSize: 9, fontWeight: 500, color: 'var(--text-tertiary)' }}>/μήνα</span></div>
                        <div style={{ fontSize: 9.5, color: 'var(--text-tertiary)' }}>{fe(r.annualCost, 0)}/έτος</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* Κουμπαράδες / αποθεματικά (sinking funds) */}
      {!editMode && <BudgetVaults propertyId={propertyId} userId={userId} suggestions={suggestions} monthlyCommitment={monthlyCost} />}

      {/* Category rows */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 16 }}>
        {secHdr('Ανά Κατηγορία', editMode ? undefined : 'cats')}
        {!(!editMode && collapsed.has('cats')) &&
        <div style={{ display: 'flex', flexDirection: 'column', gap: editMode ? 12 : 9 }}>
          {activeCats.map(cat => {
            const budget  = catBudget(cat.key);
            const actual  = viewActuals[cat.key] || 0;
            const pct     = budget > 0 ? Math.min((actual / budget) * 100, 100) : 0;
            const isOver  = actual > budget && actual > 0;
            const projOver = isCurMonth && !isOver && categoryStatus(budget, actual, catForecast(cat.key)) === 'projected_over';
            const isWarn  = !isOver && !projOver && pct > 80;
            const col     = isOver ? 'var(--negative)' : 'color-mix(in srgb, var(--text-primary) 34%, transparent)';
            const tr      = catTrend(cat.key);

            const hov = !editMode && hoverCat === cat.key;
            return (
              <div key={cat.key}
                onMouseEnter={() => !editMode && setHoverCat(cat.key)} onMouseLeave={() => setHoverCat(null)}
                style={{ borderRadius: T.radius.inner, padding: editMode ? 0 : '6px 8px', margin: editMode ? 0 : '0 -8px', background: hov ? 'var(--bg-elevated)' : 'transparent', transition: 'background 0.15s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: editMode ? 10 : 5 }}>
                  <div style={{ width: 3, height: 26, borderRadius: 2, background: editMode ? 'color-mix(in srgb, var(--text-primary) 34%, transparent)' : (hov && !isOver ? 'var(--accent)' : col), flexShrink: 0, transition: 'background 0.15s' }}/>
                  <span style={{ fontSize: 12, fontWeight: 500, fontFamily: T.font.sans, color: 'var(--text-primary)' }}>{cat.label}</span>
                  {!editMode && <span title="Τάση 12 μηνών"><Sparkline values={catSpark(cat.key)} activeIndex={_sparkYms.indexOf(viewYm)} /></span>}
                  {!editMode && isCurMonth && tr.avgPrior > 0 && tr.direction !== 'flat' && (
                    <span title={`Μέσος όρος τριμήνου: ${fe(tr.avgPrior, 0)}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 9.5, fontWeight: 700, fontFamily: T.font.num, color: tr.direction === 'up' ? 'var(--negative)' : 'var(--text-tertiary)' }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: tr.direction === 'down' ? 'scaleY(-1)' : 'none' }}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                      {tr.deltaPct > 0 ? '+' : ''}{tr.deltaPct}%
                    </span>
                  )}
                  <span style={{ flex: 1 }}/>

                  {editMode ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 170 }}>
                        <NumberInput label="" value={budgets[cat.key] ?? String(cat.default)} onChange={v => updateBudget(cat.key, v)} suffix="€ / μήνα" step={5} placeholder={String(cat.default)}/>
                      </div>
                      <button type="button" title="Αφαίρεση κατηγορίας"
                        onClick={() => removeCategory(cat.key)}
                        onMouseEnter={() => setDelCatHover(cat.key)} onMouseLeave={() => setDelCatHover(null)}
                        style={{ width: 26, height: 26, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: T.radius.inner, border: '1px solid ' + (delCatHover === cat.key ? 'var(--border-default)' : 'var(--border-subtle)'), background: 'transparent', color: delCatHover === cat.key ? 'var(--negative)' : 'var(--text-tertiary)', cursor: 'pointer', transition: 'all 0.15s', padding: 0 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                      {actual > 0
                        ? <span style={{ fontSize: 14, fontWeight: 700, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', color: isOver ? 'var(--negative)' : hov ? 'var(--accent)' : 'var(--text-primary)', transition: 'color 0.15s' }}>{fe(actual, 0)}</span>
                        : <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>—</span>
                      }
                      <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>/ {fe(budget, 0)}</span>
                      {isOver && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--negative)', background: 'var(--negative-dim)', padding: '1px 8px', borderRadius: T.radius.pill }}>+{fe(actual - budget, 0)}</span>}
                      {projOver && <span title="Με τον τρέχοντα ρυθμό θα ξεπεράσει τον στόχο" style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', padding: '1px 8px', borderRadius: T.radius.pill }}>προβλ. υπέρβαση</span>}
                      {isWarn && <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', padding: '1px 8px', borderRadius: T.radius.pill }}>{pct.toFixed(0)}%</span>}
                    </div>
                  )}
                </div>

                {!editMode && (
                  <div style={{ marginLeft: 13 }}>
                    <div style={{ height: 4, background: 'var(--bg-overlay)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: hov && !isOver ? 'var(--accent)' : col, borderRadius: 2, transition: 'width 0.5s ease, background 0.15s' }}/>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>}

        {editMode && (
          <>
            {/* Προσθήκη νέας κατηγορίας */}
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <TextInput label="Νέα κατηγορία" value={newCatName} onChange={setNewCatName} placeholder="π.χ. Καθαριότητα, Ασφάλεια…"
                  onKeyDown={e => { if (e.key === 'Enter' && newCatName.trim()) { addCategory(newCatName); setNewCatName(''); } }}/>
              </div>
              <button type="button" disabled={!newCatName.trim()}
                onClick={() => { addCategory(newCatName); setNewCatName(''); }}
                style={{ height: 38, padding: '0 16px', borderRadius: T.radius.inner, border: '1px solid var(--border-default)', background: newCatName.trim() ? 'color-mix(in srgb, var(--text-primary) 88%, transparent)' : 'var(--bg-elevated)', color: newCatName.trim() ? 'var(--bg-surface)' : 'var(--text-tertiary)', fontSize: 12.5, fontWeight: 600, fontFamily: T.font.sans, cursor: newCatName.trim() ? 'pointer' : 'default', transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
                Προσθήκη
              </button>
            </div>
            {hiddenBaseCats.length > 0 && (
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-tertiary)', fontFamily: T.font.sans, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Επαναφορά:</span>
                {hiddenBaseCats.map(c => (
                  <button key={c.key} type="button" title="Επαναφορά κατηγορίας" onClick={() => restoreCategory(c.key)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: T.radius.pill, border: '1px dashed var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 11.5, fontWeight: 500, fontFamily: T.font.sans, cursor: 'pointer' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-accent)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-default)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    {c.label}
                  </button>
                ))}
              </div>
            )}
            <div style={{ marginTop: 14, paddingTop: 16, borderTop: '1px solid var(--border-subtle)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12 }}>
              <NumberInput label="Συνολικός Μηνιαίος Στόχος (€)" value={budgets.total ?? '390'} onChange={v => updateBudget('total', v)} suffix="€ / μήνα" step={10} placeholder="390"/>
              <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '14px 16px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, fontFamily: T.font.sans }}>Άθροισμα κατηγοριών</div>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{fe(activeCats.reduce((s, c) => s + catBudget(c.key), 0), 0)}</div>
              </div>
            </div>
            {/* Ρυθμίσεις προϋπολογισμού — διακόπτες (email υπέρβασης, μεταφορά υπολοίπου) */}
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 10 }}>
              {settingToggle('notifyOverspend', notifyOn, 'Ειδοποίηση σε υπέρβαση', 'Email όταν μια κατηγορία ξεπεράσει τον στόχο — μέσω των προτιμήσεων ειδοποιήσεων και του Ημερολογίου.')}
              {settingToggle('rollover', rolloverOn, 'Μεταφορά υπολοίπου', 'Το αδιάθετο ή η υπέρβαση του μήνα μεταφέρεται στον επόμενο, αντί για μηδενισμό κάθε μήνα.')}
            </div>
          </>
        )}
      </div>

      {/* Μαζική εισαγωγή δαπανών από αρχείο (CSV / Excel) — σωστή κατηγορία & μήνας */}
      {!editMode && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 16, marginTop: 12 }}>
          {secHdr('Εισαγωγή δεδομένων', 'import', undefined,
            <InfoDot text="Ανέβασε τραπεζικό αντίγραφο ή λίστα εξόδων (CSV ή Excel) και το εργαλείο αναγνωρίζει αυτόματα ημερομηνία, ποσό και κατηγορία. Ελέγχεις και διορθώνεις πριν την καταχώρηση, ώστε οι δαπάνες να μπαίνουν στον σωστό μήνα και στη σωστή κατηγορία." />)}
          {/* Μόνο βασικές κατηγορίες: οι custom c_* δεν χαρτογραφούνται στο ιστορικό, θα έπεφταν στις «Λοιπές». */}
          {!collapsed.has('import') && (
            <BudgetImport propertyId={propertyId} userId={userId} cats={activeCats.filter(c => !c.key.startsWith('c_')).map(c => ({ key: c.key, label: c.label }))} onImported={loadData} />
          )}
        </div>
      )}
    </div>
  );
}