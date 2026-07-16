'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { NumberInput } from './UIComponents';
import { T, fe, Spinner } from '@/components/Theme';
import { forecastMonthEnd, categoryStatus, annualSummary, periodTrend } from '@/lib/billing/budget';
import { reservePlan, allocate } from '@/lib/billing/budgetPro';
import { annuityMonthly } from '@/lib/loans/recommend';
import { InfoDot } from './UIComponents';
import BudgetVaults from './BudgetVaults';

const monthsUntilDue = (due?: string): number => {
  if (!due) return 0;
  const d = new Date(due), now = new Date();
  return Math.max(0, (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth()));
};

// Κατηγορίες που θεωρούνται «σταθερές» (πάγιοι λογαριασμοί, χρεώνονται ολόκληρο
// τον μήνα) — δεν προβάλλονται γραμμικά. Οι υπόλοιπες συσσωρεύονται μέσα στον μήνα.
const FIXED_CATS = ['electricity', 'water', 'internet', 'heating', 'insurance', 'services', 'common'];
const ymOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

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

interface Props { propertyId: string; userId?: string; }

export default function BillsBudget({ propertyId, userId = '' }: Props) {
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
  const [loanMonthly,  setLoanMonthly]  = useState(0);
  const [vaultMonthly, setVaultMonthly] = useState(0);
  const [rentalMode,   setRentalMode]   = useState<'long_term' | 'short_term' | ''>('');
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [editMode,     setEditMode]     = useState(false);
  const [rtOk,         setRtOk]         = useState(false);
  const [heroHover,    setHeroHover]    = useState(false);

  const mapCategory = (cat: string): CatKey | 'other' => {
    const m: Record<string, CatKey> = {
      electricity: 'electricity', water: 'water', eydap: 'water',
      internet: 'internet', phone: 'internet', tv: 'internet',
      heating: 'heating', gas: 'heating',
      insurance: 'insurance', streaming: 'insurance',
      taxes: 'services', enfia: 'services', municipal: 'services',
      common: 'common', koinoxrista: 'common',
      maintenance: 'maintenance', repair: 'maintenance',
    };
    return m[cat?.toLowerCase()] ?? 'maintenance';
  };

  const loadData = useCallback(async () => {
    if (!propertyId) return;
    try {
      const now   = new Date();
      const y     = now.getFullYear();
      const m     = String(now.getMonth() + 1).padStart(2, '0');
      const start = `${y}-${m}-01`;
      const end   = `${y}-${m}-${new Date(y, now.getMonth() + 1, 0).getDate()}T23:59:59`;
      // Ιστορικό 13 μηνών (τρέχων + 12 πίσω) για πρόβλεψη/ετήσια εικόνα/τάσεις.
      const histStart = `${ymOf(new Date(y, now.getMonth() - 12, 1))}-01`;

      const [budgetRes, billsRes, settRes, expRes, histBillsRes, histExpRes] = await Promise.all([
        supabase.from('bills_settings').select('data').eq('property_id', propertyId).eq('section', 'budgets').maybeSingle(),
        supabase.from('bills').select('category,amount,paid').eq('property_id', propertyId).gte('created_at', start).lte('created_at', end),
        supabase.from('bills_settings').select('section,data').eq('property_id', propertyId).in('section', ['providers','insurance','services','common']),
        // Λοιπές δαπάνες: έξοδα του μήνα που ΔΕΝ προέρχονται από λογαριασμό
        // (bill_id null), ώστε να μη διπλομετρηθούν οι λογαριασμοί.
        supabase.from('expenses').select('amount,date,bill_id,expense_group').eq('property_id', propertyId).is('bill_id', null).gte('date', start).lte('date', `${y}-${m}-31`),
        supabase.from('bills').select('category,amount,created_at').eq('property_id', propertyId).gte('created_at', histStart),
        supabase.from('expenses').select('amount,date,expense_group').eq('property_id', propertyId).is('bill_id', null).gte('date', histStart),
      ]);

      // ── Έσοδα + δεσμευμένες εκροές (για το «Ασφαλές διαθέσιμο») ──
      const [propRes, loansRes, tenantsRes, staysRes, vaultsRes] = await Promise.all([
        supabase.from('user_properties').select('rental_mode,target_rent').eq('id', propertyId).maybeSingle(),
        supabase.from('loans').select('amount,rate,years,status').eq('property_id', propertyId),
        supabase.from('tenants').select('monthly_rent,lease_end').eq('property_id', propertyId),
        supabase.from('client_stays').select('total,nights,nightly_rate,check_in').eq('property_id', propertyId).gte('check_in', start).lte('check_in', `${y}-${m}-31`),
        supabase.from('bills_settings').select('data').eq('property_id', propertyId).eq('section', 'vaults').maybeSingle(),
      ]);
      const rMode = (propRes.data?.rental_mode as 'long_term' | 'short_term' | undefined) ?? '';
      setRentalMode(rMode);
      // Έσοδα μήνα: βραχυχρόνια → άθροισμα καταλυμάτων· μακροχρόνια → συμβατικό ενοίκιο (ή στόχος).
      let inc = 0;
      if (rMode === 'short_term') {
        inc = (staysRes.data ?? []).reduce((s: number, st: any) => s + (Number(st.total) || (Number(st.nights) || 0) * (Number(st.nightly_rate) || 0)), 0);
      } else {
        const rentSum = (tenantsRes.data ?? []).reduce((s: number, t: any) => s + (Number(t.monthly_rent) || 0), 0);
        inc = rentSum > 0 ? rentSum : (Number(propRes.data?.target_rent) || 0);
      }
      setIncome(Math.round(inc));
      // Δόση δανείου: ζωντανός υπολογισμός από ενεργά δάνεια (όχι διπλομέτρηση).
      const loanM = (loansRes.data ?? [])
        .filter((l: any) => l.status !== 'inactive' && l.status !== 'closed')
        .reduce((s: number, l: any) => s + annuityMonthly(Number(l.amount) || 0, Number(l.rate) || 0, Number(l.years) || 0), 0);
      setLoanMonthly(Math.round(loanM));
      // Μηνιαίες εισφορές κουμπαράδων.
      const vArr = (vaultsRes.data?.data as { vaults?: { target: number; current: number; due?: string }[] } | null)?.vaults ?? [];
      const vaultM = vArr.reduce((s, v) => s + reservePlan(Number(v.target) || 0, Number(v.current) || 0, monthsUntilDue(v.due)).requiredMonthly, 0);
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
      (histExpRes.data ?? []).forEach((e: any) => addHist(String(e.date ?? '').slice(0, 7), e.expense_group === 'maintenance' ? 'maintenance' : 'other', e.amount || 0));
      setMonthTotals(mTotals);
      setCatMonth(cMonth);

      if (budgetRes.data?.data) {
        const saved = budgetRes.data.data as Record<string, unknown>;
        setBudgets(prev => { const n = { ...prev }; Object.entries(saved).forEach(([k, v]) => { if (k !== 'participants') n[k] = String(v); }); return n; });
      }

      const billActuals: Record<string, number> = {};
      (billsRes.data ?? []).forEach(b => {
        const key = mapCategory(b.category ?? '');
        if (key !== 'other') billActuals[key] = (billActuals[key] ?? 0) + (b.amount ?? 0);
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
        if (e.expense_group === 'maintenance') billActuals.maintenance = (billActuals.maintenance || 0) + amt;
        else billActuals.other = (billActuals.other || 0) + amt;
      });

      setActuals(billActuals);
    } catch (_) {}
    finally { setLoading(false); }
  }, [propertyId]);

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
  const masterBudget  = parseFloat(budgets.total) || CATS.reduce((s, c) => s + c.default, 0);
  const actualTotal   = CATS.reduce((s, c) => s + (actuals[c.key] || 0), 0);
  const overBudget    = CATS.filter(c => (actuals[c.key] || 0) > (parseFloat(budgets[c.key]) || c.default));
  const catBudget     = (key: string) => parseFloat(budgets[key]) || CATS.find(c => c.key === key)!.default;

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
  const projectedOver  = CATS.filter(c => categoryStatus(catBudget(c.key), actuals[c.key] || 0, catForecast(c.key)) === 'projected_over');

  // Ετήσια: πραγματικά YTD από καταγεγραμμένες εγγραφές (bills + λοιπές δαπάνες).
  const _yStr        = String(_now.getFullYear()) + '-';
  const ytdActual    = Object.entries(monthTotals).filter(([ym]) => ym.startsWith(_yStr)).reduce((s, [, v]) => s + v, 0);
  const annual       = annualSummary(masterBudget, ytdActual, _now.getMonth() + 1);
  // Τάση μήνα: τρέχον καταγεγραμμένο σύνολο έναντι μέσου όρου 3 προηγούμενων.
  const monthTrend   = periodTrend(monthTotals[_curYm] || 0, _priorYms.map(ym => monthTotals[ym] || 0));
  // Τάση ανά κατηγορία (μόνο όταν υπάρχει ιστορικό).
  const catTrend     = (key: string) => periodTrend(actuals[key] || 0, _priorYms.map(ym => catMonth[ym]?.[key] || 0));

  // ── «Ασφαλές διαθέσιμο» (Monzo Left to Spend / owner draw) ────────────────────
  // Δεσμευμένοι λογαριασμοί = πάγιες κατηγορίες (στόχος)· εκροές = δόση + κουμπαράδες.
  const committedBills = FIXED_CATS.reduce((s, k) => s + catBudget(k), 0);
  const alloc          = allocate({ income, committedBills, reserveContributions: vaultMonthly, loanPayment: loanMonthly });
  const monthlyCost    = committedBills + loanMonthly + vaultMonthly;
  const hasIncome      = income > 0;
  const isShortfall    = hasIncome && (committedBills + loanMonthly + vaultMonthly) > income;

  const secHdr = (label: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)' }}/>
      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: T.font.sans }}>{label}</span>
    </div>
  );

  if (loading) return <Spinner label="Φόρτωση…" />;

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>Προϋπολογισμός</div>
            <span title="Ζωντανή ενημέρωση δεδομένων σε πραγματικό χρόνο" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, color: rtOk ? 'var(--text-tertiary)' : 'var(--text-tertiary)', background: 'var(--bg-elevated)', padding: '3px 10px', borderRadius: T.radius.pill, border: '1px solid var(--border-subtle)', fontFamily: T.font.sans }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: rtOk ? 'var(--text-tertiary)' : 'var(--border-default)', display: 'inline-block' }}/>
              Live
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {new Date().toLocaleDateString('el-GR', { month: 'long', year: 'numeric' })}
            {saving && <span style={{ marginLeft: 10, color: 'var(--text-tertiary)', fontSize: 11 }}>· Αποθήκευση...</span>}
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
      {!editMode && (hasIncome || monthlyCost > 0) && (() => {
        const safeRaw = income - monthlyCost;
        const val = hasIncome ? safeRaw : monthlyCost;
        const numCol = !hasIncome ? 'var(--text-primary)' : safeRaw < 0 ? 'var(--negative)' : heroHover ? 'var(--accent)' : 'var(--text-primary)';
        const seg = (v: number) => income > 0 ? Math.max(0, Math.min(100, (v / income) * 100)) : 0;
        return (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 20, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div onMouseEnter={() => setHeroHover(true)} onMouseLeave={() => setHeroHover(false)} onTouchStart={() => setHeroHover(true)} onTouchEnd={() => setHeroHover(false)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: T.font.sans }}>{hasIncome ? 'Ασφαλές διαθέσιμο' : 'Μηνιαίο κόστος ακινήτου'}</span>
                  <InfoDot text={hasIncome ? 'Έσοδα μείον δεσμευμένους λογαριασμούς, δόση δανείου και μηνιαίες εισφορές κουμπαράδων. Το ποσό που μπορείς με ασφάλεια να αποσύρεις ή να διαθέσεις κάθε μήνα.' : 'Το άθροισμα των παγίων λογαριασμών, της δόσης δανείου και των εισφορών κουμπαράδων — τι σου κοστίζει το ακίνητο κάθε μήνα.'} />
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
                    <span key={x.l} style={{ fontVariantNumeric: 'tabular-nums' }}>{x.l} <strong style={{ color: 'var(--text-primary)', fontFamily: T.font.mono }}>{fe(x.v, 0)}</strong></span>
                  ))}
                </div>
                {isShortfall && (
                  <div style={{ marginTop: 12, fontSize: 11.5, color: 'var(--negative)', fontFamily: T.font.sans }}>Τα δεσμευμένα έξοδα ξεπερνούν τα έσοδα κατά {fe(monthlyCost - income, 0)} — μείωσε εισφορές κουμπαράδων ή αναθεώρησε τους στόχους.</div>
                )}
              </>
            )}
          </div>
        );
      })()}

      {/* Over-budget alerts */}
      {!editMode && overBudget.length > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {overBudget.map(cat => {
            const budget = parseFloat(budgets[cat.key]) || cat.default;
            const actual = actuals[cat.key] || 0;
            return (
              <div key={cat.key} style={{ background: 'var(--negative-dim)', border: '1px solid var(--negative-border)', borderRadius: T.radius.inner, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--negative)', flexShrink: 0 }}/>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--negative)', fontFamily: T.font.sans }}>{cat.label}</span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>υπέρβαση</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--negative)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>+{fe(actual - budget)}</span>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>({fe(actual)} vs {fe(budget)})</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Προβλεπόμενη υπέρβαση — με τον τρέχοντα ρυθμό (προειδοποίηση, όχι ήδη υπέρβαση) */}
      {!editMode && projectedOver.length > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: T.radius.inner, padding: '10px 16px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><path d="M23 6l-9.5 9.5-5-5L1 18"/><polyline points="17 6 23 6 23 12"/></svg>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.5 }}>
            Με τον τρέχοντα ρυθμό, θα ξεπεραστεί ο στόχος σε: <strong style={{ color: 'var(--text-primary)' }}>{projectedOver.map(c => c.label).join(', ')}</strong>
          </span>
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap: 10, marginBottom: 16 }}>
        {([
          { label: 'Στόχος / μήνα',    value: fe(masterBudget), color: 'var(--text-primary)' },
          { label: 'Έως τώρα',          value: fe(actualTotal),  color: actualTotal > masterBudget ? 'var(--negative)' : 'var(--text-primary)' },
          { label: 'Πρόβλεψη μήνα',     value: fe(forecastTotal), color: forecastTotal > masterBudget ? 'var(--negative)' : 'var(--text-primary)' },
          { label: 'Διαθέσιμο',         value: fe(Math.max(0, masterBudget - actualTotal)), color: 'var(--text-primary)' },
        ] as const).map((k, i) => (
          <div key={i} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '16px 18px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, fontFamily: T.font.sans }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: k.color, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Master progress */}
      {!editMode && (() => {
        const pct    = masterBudget > 0 ? Math.min((actualTotal / masterBudget) * 100, 100) : 0;
        const isOver = actualTotal > masterBudget;
        const col    = isOver ? 'var(--negative)' : 'color-mix(in srgb, var(--text-primary) 34%, transparent)';
        return (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 20, marginBottom: 16 }}>
            {secHdr('Σύνολο Μήνα')}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>
              <span>{fe(actualTotal)}</span>
              <span style={{ color: 'var(--text-tertiary)' }}>/ {fe(masterBudget)}</span>
            </div>
            <div style={{ height: 10, background: 'var(--bg-overlay)', borderRadius: 5, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{ height: '100%', width: `${pct}%`, background: col, borderRadius: 5, transition: 'width 0.6s ease' }}/>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
              <span style={{ color: col, fontWeight: 700 }}>{pct.toFixed(0)}% χρησιμοποιήθηκε</span>
              <span>{isOver ? `Υπέρβαση ${fe(actualTotal - masterBudget)}` : `Απομένει ${fe(masterBudget - actualTotal)}`}</span>
            </div>
          </div>
        );
      })()}

      {/* Ετήσια εικόνα — YTD και προβολή τέλους έτους από καταγεγραμμένες εγγραφές */}
      {!editMode && (() => {
        const ytdPct = annual.ytdBudget > 0 ? Math.min((annual.ytdActual / annual.ytdBudget) * 100, 100) : 0;
        const ytdOver = annual.ytdActual > annual.ytdBudget;
        const ytdCol = ytdOver ? 'var(--negative)' : 'color-mix(in srgb, var(--text-primary) 34%, transparent)';
        const trDir = monthTrend.direction;
        return (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 20, marginBottom: 16 }}>
            {secHdr('Ετήσια εικόνα')}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 18 }}>
              {/* YTD */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>
                  <span style={{ fontFamily: T.font.sans }}>Από την αρχή του έτους</span>
                  <span>{fe(annual.ytdActual, 0)} / {fe(annual.ytdBudget, 0)}</span>
                </div>
                <div style={{ height: 8, background: 'var(--bg-overlay)', borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
                  <div style={{ height: '100%', width: `${ytdPct}%`, background: ytdCol, borderRadius: 4, transition: 'width 0.6s ease' }}/>
                </div>
                <div style={{ fontSize: 10, color: annual.variance > 0 ? 'var(--negative)' : 'var(--text-tertiary)', fontFamily: T.font.sans }}>
                  {annual.variance > 0 ? `Υπέρβαση ${fe(annual.variance, 0)} έναντι στόχου` : `Εντός στόχου κατά ${fe(-annual.variance, 0)}`}
                </div>
              </div>
              {/* Προβολή τέλους έτους */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontFamily: T.font.sans }}>Προβολή τέλους έτους</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 22, fontWeight: 700, color: annual.onTrack ? 'var(--text-primary)' : 'var(--negative)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{fe(annual.projectedYearEnd, 0)}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.mono }}>στόχος {fe(annual.annualBudget, 0)}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 9px', borderRadius: T.radius.pill, fontFamily: T.font.sans, color: annual.onTrack ? 'var(--text-secondary)' : 'var(--negative)', background: annual.onTrack ? 'var(--bg-elevated)' : 'var(--negative-dim)', border: `1px solid ${annual.onTrack ? 'var(--border-subtle)' : 'var(--negative-border)'}` }}>{annual.onTrack ? 'Εντός στόχου' : 'Εκτός στόχου'}</span>
                </div>
              </div>
            </div>
            {monthTrend.avgPrior > 0 && (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>
                <span style={{ display: 'inline-flex', color: trDir === 'up' ? 'var(--negative)' : trDir === 'down' ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>
                  {trDir === 'flat'
                    ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: trDir === 'down' ? 'scaleY(-1)' : 'none' }}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>}
                </span>
                <span>Αυτός ο μήνας {fe(monthTotals[_curYm] || 0, 0)} · {trDir === 'flat' ? 'σταθερά' : `${monthTrend.deltaPct > 0 ? '+' : ''}${monthTrend.deltaPct}%`} έναντι μέσου όρου τριμήνου ({fe(monthTrend.avgPrior, 0)})</span>
              </div>
            )}
          </div>
        );
      })()}

      {/* Κουμπαράδες / αποθεματικά (sinking funds) */}
      {!editMode && <BudgetVaults propertyId={propertyId} userId={userId} />}

      {/* Category rows */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 20 }}>
        {secHdr('Ανά Κατηγορία')}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {CATS.map(cat => {
            const budget  = parseFloat(budgets[cat.key]) || cat.default;
            const actual  = actuals[cat.key] || 0;
            const pct     = budget > 0 ? Math.min((actual / budget) * 100, 100) : 0;
            const isOver  = actual > budget && actual > 0;
            const projOver = !isOver && categoryStatus(budget, actual, catForecast(cat.key)) === 'projected_over';
            const isWarn  = !isOver && !projOver && pct > 80;
            const col     = isOver ? 'var(--negative)' : 'color-mix(in srgb, var(--text-primary) 34%, transparent)';
            const tr      = catTrend(cat.key);

            return (
              <div key={cat.key}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: editMode ? 10 : 6 }}>
                  <div style={{ width: 3, height: 32, borderRadius: 2, background: col, flexShrink: 0 }}/>
                  <span style={{ fontSize: 12, fontWeight: 500, fontFamily: T.font.sans, color: 'var(--text-primary)' }}>{cat.label}</span>
                  {!editMode && tr.avgPrior > 0 && tr.direction !== 'flat' && (
                    <span title={`Μέσος όρος τριμήνου: ${fe(tr.avgPrior, 0)}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 9.5, fontWeight: 700, fontFamily: T.font.mono, color: tr.direction === 'up' ? 'var(--negative)' : 'var(--text-tertiary)' }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: tr.direction === 'down' ? 'scaleY(-1)' : 'none' }}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                      {tr.deltaPct > 0 ? '+' : ''}{tr.deltaPct}%
                    </span>
                  )}
                  <span style={{ flex: 1 }}/>

                  {editMode ? (
                    <div style={{ width: 170 }}>
                      <NumberInput label="" value={budgets[cat.key] ?? String(cat.default)} onChange={v => updateBudget(cat.key, v)} suffix="€ / μήνα" step={5} placeholder={String(cat.default)}/>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                      {actual > 0
                        ? <span style={{ fontSize: 14, fontWeight: 700, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', color: isOver ? 'var(--negative)' : 'var(--text-primary)' }}>{fe(actual, 0)}</span>
                        : <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>—</span>
                      }
                      <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>/ {fe(budget, 0)}</span>
                      {isOver && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--negative)', background: 'var(--negative-dim)', padding: '1px 8px', borderRadius: T.radius.pill }}>+{fe(actual - budget, 0)}</span>}
                      {projOver && <span title="Με τον τρέχοντα ρυθμό θα ξεπεράσει τον στόχο" style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', padding: '1px 8px', borderRadius: T.radius.pill }}>προβλ. υπέρβαση</span>}
                      {isWarn && <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', padding: '1px 8px', borderRadius: T.radius.pill }}>{pct.toFixed(0)}%</span>}
                    </div>
                  )}
                </div>

                {!editMode && (
                  <div style={{ marginLeft: 13 }}>
                    <div style={{ height: 4, background: 'var(--bg-overlay)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: col, borderRadius: 2, transition: 'width 0.5s ease' }}/>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {editMode && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-subtle)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12 }}>
            <NumberInput label="Συνολικός Μηνιαίος Στόχος (€)" value={budgets.total ?? '390'} onChange={v => updateBudget('total', v)} suffix="€ / μήνα" step={10} placeholder="390"/>
            <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '14px 16px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, fontFamily: T.font.sans }}>Άθροισμα κατηγοριών</div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{fe(CATS.reduce((s, c) => s + (parseFloat(budgets[c.key]) || c.default), 0), 0)}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}