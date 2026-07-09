'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { NumberInput } from './UIComponents';
import { T, fe, Spinner } from '@/components/Theme';

// ── Category definitions ──────────────────────────────────────────────────────
const CATS = [
  { key: 'electricity',  label: 'Ρεύμα',              default: 80  },
  { key: 'water',        label: 'Νερό',                default: 25  },
  { key: 'internet',     label: 'Internet & Τηλεφωνία',default: 35  },
  { key: 'heating',      label: 'Θέρμανση',            default: 60  },
  { key: 'insurance',    label: 'Ασφάλεια & Συνδρομές',default: 30  },
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
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [editMode,     setEditMode]     = useState(false);
  const [rtOk,         setRtOk]         = useState(false);

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

      const [budgetRes, billsRes, settRes, expRes] = await Promise.all([
        supabase.from('bills_settings').select('data').eq('property_id', propertyId).eq('section', 'budgets').maybeSingle(),
        supabase.from('bills').select('category,amount,paid').eq('property_id', propertyId).gte('created_at', start).lte('created_at', end),
        supabase.from('bills_settings').select('section,data').eq('property_id', propertyId).in('section', ['providers','insurance','services','common']),
        // Λοιπές δαπάνες: έξοδα του μήνα που ΔΕΝ προέρχονται από λογαριασμό
        // (bill_id null), ώστε να μη διπλομετρηθούν οι λογαριασμοί.
        supabase.from('expenses').select('amount,date,bill_id,expense_group').eq('property_id', propertyId).is('bill_id', null).gte('date', start).lte('date', `${y}-${m}-31`),
      ]);

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
            <span title="Ζωντανή ενημέρωση δεδομένων σε πραγματικό χρόνο" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, color: rtOk ? 'var(--positive)' : 'var(--text-tertiary)', background: 'var(--bg-elevated)', padding: '3px 10px', borderRadius: T.radius.pill, border: '1px solid var(--border-subtle)', fontFamily: T.font.sans }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: rtOk ? 'var(--positive)' : 'var(--border-default)', display: 'inline-block' }}/>
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
            style={{ padding: '7px 16px', fontSize: 11, fontWeight: 600, borderRadius: T.radius.btn, border: `1px solid ${editMode ? 'var(--accent)' : 'var(--border-default)'}`, background: editMode ? 'rgba(26,115,232,0.1)' : 'transparent', color: editMode ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', fontFamily: T.font.sans }}>
            {editMode ? 'Αποθήκευση' : 'Ορισμός Στόχων'}
          </button>
        </div>
      </div>

      {/* Over-budget alerts */}
      {!editMode && overBudget.length > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {overBudget.map(cat => {
            const budget = parseFloat(budgets[cat.key]) || cat.default;
            const actual = actuals[cat.key] || 0;
            return (
              <div key={cat.key} style={{ background: 'rgba(197,34,31,0.05)', border: '1px solid rgba(197,34,31,0.2)', borderRadius: T.radius.inner, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
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

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap: 10, marginBottom: 16 }}>
        {([
          { label: 'Στόχος / μήνα',    value: fe(masterBudget), color: 'var(--text-primary)' },
          { label: 'Πραγματικό',        value: fe(actualTotal),  color: actualTotal > masterBudget ? 'var(--negative)' : 'var(--text-primary)' },
          { label: 'Διαθέσιμο',         value: fe(Math.max(0, masterBudget - actualTotal)), color: 'var(--text-primary)' },
          { label: 'Κατηγ. σε υπέρβαση', value: String(overBudget.length), color: overBudget.length > 0 ? 'var(--negative)' : 'var(--text-primary)' },
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
        const col    = isOver ? 'var(--negative)' : pct > 80 ? 'var(--warning)' : 'var(--accent)';
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

      {/* Category rows */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 20 }}>
        {secHdr('Ανά Κατηγορία')}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {CATS.map(cat => {
            const budget  = parseFloat(budgets[cat.key]) || cat.default;
            const actual  = actuals[cat.key] || 0;
            const pct     = budget > 0 ? Math.min((actual / budget) * 100, 100) : 0;
            const isOver  = actual > budget && actual > 0;
            const isWarn  = !isOver && pct > 80;
            const col     = isOver ? 'var(--negative)' : isWarn ? 'var(--warning)' : 'var(--accent)';

            return (
              <div key={cat.key}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: editMode ? 10 : 6 }}>
                  <div style={{ width: 3, height: 32, borderRadius: 2, background: col, flexShrink: 0 }}/>
                  <span style={{ fontSize: 12, fontWeight: 500, flex: 1, fontFamily: T.font.sans, color: 'var(--text-primary)' }}>{cat.label}</span>

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
                      {isOver && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--negative)', background: 'rgba(197,34,31,0.1)', padding: '1px 8px', borderRadius: T.radius.pill }}>+{fe(actual - budget, 0)}</span>}
                      {isWarn && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--warning)', background: 'rgba(242,153,0,0.1)', padding: '1px 8px', borderRadius: T.radius.pill }}>{pct.toFixed(0)}%</span>}
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