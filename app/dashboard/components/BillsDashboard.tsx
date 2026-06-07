'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { NumberInput, TextInput, CustomSelect, DatePicker, Toggle } from './UIComponents';
import BillsPDFExport from './BillsPDFExport';

const fe = (n: number, d = 0) => `${n.toLocaleString('el-GR', { minimumFractionDigits: d, maximumFractionDigits: d })} €`;
const MONTHS_GR = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαΐ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];

interface BillEntry {
  id: string; property_id?: string; user_id?: string;
  category: string; name: string; amount: number;
  vat_rate?: number; period?: string; due_date: string;
  paid: boolean; recurring: boolean; notes?: string;
  kwh?: number; ert?: number; etmear?: number; dimotika?: number;
  created_at?: string;
}

interface Props { propertyId: string; userId: string; propertyName?: string; propertyAddress?: string; }

const CATEGORIES = [
  { value: 'electricity', label: 'Ρεύμα', icon: '⚡', color: '#f59e0b' },
  { value: 'common', label: 'Κοινόχρηστα', icon: '🏛', color: '#6366f1' },
  { value: 'internet', label: 'Internet/TV', icon: '📶', color: '#3b82f6' },
  { value: 'water', label: 'Νερό', icon: '💧', color: '#06b6d4' },
  { value: 'gas', label: 'Αέριο/Θέρμανση', icon: '🔥', color: '#ef4444' },
  { value: 'insurance', label: 'Ασφάλεια', icon: '🛡️', color: '#10b981' },
  { value: 'security', label: 'Security', icon: '🔒', color: '#f97316' },
  { value: 'streaming', label: 'Streaming/Media', icon: '🎬', color: '#ec4899' },
  { value: 'enfia', label: 'ΕΝΦΙΑ', icon: '🏛', color: '#64748b' },
  { value: 'dimotika', label: 'Δημοτικά Τέλη', icon: '🏙', color: '#94a3b8' },
  { value: 'cleaning', label: 'Καθαρισμός', icon: '🧹', color: '#84cc16' },
  { value: 'garden', label: 'Κήπος', icon: '🌿', color: '#22c55e' },
  { value: 'pool', label: 'Πισίνα', icon: '🏊', color: '#0ea5e9' },
  { value: 'elevator', label: 'Ανελκυστήρας', icon: '🛗', color: '#a78bfa' },
  { value: 'ac_service', label: 'Σέρβις Κλιματιστικού', icon: '❄️', color: '#38bdf8' },
  { value: 'renovation', label: 'Ανακαίνιση/Επισκευή', icon: '🔨', color: '#d97706' },
  { value: 'pest', label: 'Απεντόμωση', icon: '🐛', color: '#78716c' },
  { value: 'other', label: 'Άλλο', icon: '📦', color: '#94a3b8' },
];

const CAT_OPTIONS = CATEGORIES.map(c => ({ value: c.value, label: `${c.icon} ${c.label}` }));
const VAT_OPTIONS = [
  { value: '6', label: 'ΦΠΑ 6% (Ρεύμα, Αέριο)' },
  { value: '13', label: 'ΦΠΑ 13%' },
  { value: '24', label: 'ΦΠΑ 24% (Γενικό)' },
  { value: '0', label: 'Χωρίς ΦΠΑ' },
];
const PERIOD_OPTIONS = [
  { value: '', label: '— Επιλογή περιόδου —' },
  ...MONTHS_GR.map(m => ({ value: `${m} 2026`, label: `${m} 2026` })),
  { value: 'custom', label: 'Προσαρμοσμένο' },
];
const MARKET_BENCHMARKS: { [k: string]: number } = {
  electricity: 45, common: 40, internet: 25, water: 15, gas: 30,
  insurance: 18, security: 25, streaming: 20, enfia: 30, dimotika: 8,
};

const cat = (v: string) => CATEGORIES.find(c => c.value === v) || CATEGORIES[CATEGORIES.length - 1];

export default function BillsDashboard({ propertyId, userId, propertyName = 'Ακίνητό μου', propertyAddress = '' }: Props) {
  const supabase = createClient();
  const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '20px', marginBottom: '16px' };
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  const [bills, setBills] = useState<BillEntry[]>([]);
  const [history, setHistory] = useState<{ [cat: string]: string[] }>(
    Object.fromEntries(CATEGORIES.map(c => [c.value, Array(12).fill('')]))
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    category: 'electricity', name: '', amount: '', kwh: '',
    period: '', period_custom: '', due_date: '', recurring: true,
    notes: '', vat_rate: '6', ert: '', etmear: '', dimotika_amt: '',
  });
  const sf = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  // ── Load from Supabase ──────────────────────────────────────────────────────
  const loadBills = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('bills')
      .select('*')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false });
    if (!error && data) setBills(data);
    setLoading(false);
  }, [propertyId]);

  const loadHistory = useCallback(async () => {
    const { data, error } = await supabase
      .from('bills_history')
      .select('*')
      .eq('property_id', propertyId)
      .eq('year', currentYear);
    if (!error && data) {
      const h = Object.fromEntries(CATEGORIES.map(c => [c.value, Array(12).fill('')]));
      data.forEach((row: any) => {
        if (h[row.category]) h[row.category][row.month] = row.amount > 0 ? String(row.amount) : '';
      });
      setHistory(h);
    }
  }, [propertyId, currentYear]);

  useEffect(() => { loadBills(); loadHistory(); }, [loadBills, loadHistory]);

  // ── Save history cell ───────────────────────────────────────────────────────
  const saveHistoryCell = async (category: string, month: number, value: string) => {
    const amount = parseFloat(value) || 0;
    await supabase.from('bills_history').upsert({
      property_id: propertyId, user_id: userId,
      category, month, year: currentYear, amount,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'property_id,category,month,year' });
  };

  const updateHistory = (category: string, month: number, value: string) => {
    setHistory(h => { const n = { ...h }; n[category] = [...(n[category] || Array(12).fill(''))]; n[category][month] = value; return n; });
    saveHistoryCell(category, month, value);
  };

  // ── Add bill ────────────────────────────────────────────────────────────────
  const addBill = async () => {
    if (!form.name || !form.amount) return;
    setSaving(true);
    const period = form.period === 'custom' ? form.period_custom : form.period;
    const payload = {
      property_id: propertyId, user_id: userId,
      category: form.category, name: form.name,
      amount: parseFloat(form.amount),
      vat_rate: parseInt(form.vat_rate),
      period: period || null,
      due_date: form.due_date || null,
      paid: false, recurring: form.recurring,
      notes: form.notes || null,
      kwh: form.kwh ? parseFloat(form.kwh) : null,
      ert: form.ert ? parseFloat(form.ert) : null,
      etmear: form.etmear ? parseFloat(form.etmear) : null,
      dimotika: form.dimotika_amt ? parseFloat(form.dimotika_amt) : null,
    };
    const { data, error } = await supabase.from('bills').insert(payload).select().single();
    if (!error && data) setBills(prev => [data, ...prev]);
    setForm({ category: 'electricity', name: '', amount: '', kwh: '', period: '', period_custom: '', due_date: '', recurring: true, notes: '', vat_rate: '6', ert: '', etmear: '', dimotika_amt: '' });
    setShowForm(false);
    setSaving(false);
  };

  // ── Toggle paid ─────────────────────────────────────────────────────────────
  const togglePaid = async (id: string) => {
    const bill = bills.find(b => b.id === id);
    if (!bill) return;
    const newPaid = !bill.paid;
    setBills(prev => prev.map(b => b.id === id ? { ...b, paid: newPaid } : b));
    await supabase.from('bills').update({ paid: newPaid, paid_at: newPaid ? new Date().toISOString() : null }).eq('id', id);
  };

  // ── Delete bill ─────────────────────────────────────────────────────────────
  const deleteBill = async (id: string) => {
    setBills(prev => prev.filter(b => b.id !== id));
    await supabase.from('bills').delete().eq('id', id);
  };

  // ── Calculations ────────────────────────────────────────────────────────────
  const calc = useMemo(() => {
    const totalMonthly = bills.filter(b => b.recurring).reduce((s, b) => s + b.amount, 0);
    const totalUnpaid = bills.filter(b => !b.paid).reduce((s, b) => s + b.amount, 0);
    const totalPaid = bills.filter(b => b.paid).reduce((s, b) => s + b.amount, 0);
    const overdue = bills.filter(b => !b.paid && b.due_date && new Date(b.due_date) < today);
    const dueSoon = bills.filter(b => !b.paid && b.due_date && new Date(b.due_date) >= today && new Date(b.due_date) <= new Date(today.getTime() + 7 * 86400000));
    const byCategory = CATEGORIES.map(c => ({
      ...c, monthly: bills.filter(b => b.category === c.value && b.recurring).reduce((s, b) => s + b.amount, 0),
      benchmark: MARKET_BENCHMARKS[c.value] || 0,
    })).filter(c => c.monthly > 0);
    const historyTotals = Array(12).fill(0).map((_, i) => CATEGORIES.reduce((s, c) => s + (parseFloat(history[c.value]?.[i]) || 0), 0));
    const filled = historyTotals.filter(v => v > 0);
    const avgMonthly = filled.length > 0 ? filled.reduce((a, b) => a + b, 0) / filled.length : totalMonthly;
    const maxHistory = Math.max(...historyTotals, totalMonthly, 1);
    const alerts: { type: 'danger' | 'warning' | 'info'; msg: string }[] = [];
    if (overdue.length > 0) alerts.push({ type: 'danger', msg: `${overdue.length} λογαριασμός/-οί σε καθυστέρηση: ${overdue.map(b => b.name).join(', ')}` });
    if (dueSoon.length > 0) alerts.push({ type: 'warning', msg: `${dueSoon.length} λογαριασμός/-οί λήγει εντός 7 ημερών` });
    byCategory.forEach(c => { if (c.benchmark > 0 && c.monthly > c.benchmark * 1.3) alerts.push({ type: 'warning', msg: `${c.icon} ${c.label}: ${fe(c.monthly)}/μήνα — 30%+ πάνω από μ.ο.` }); });
    return { totalMonthly, totalUnpaid, totalPaid, overdue, dueSoon, byCategory, historyTotals, avgMonthly, maxHistory, alerts };
  }, [bills, history]);

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px', color: 'var(--text-tertiary)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '28px', marginBottom: '12px', opacity: 0.4 }}>⚡</div>
        <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Φόρτωση λογαριασμών...</div>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: 'Inter,sans-serif', color: 'var(--text-primary)' }}>

      {/* Alerts */}
      {calc.alerts.map((a, i) => (
        <div key={i} style={{
          background: a.type === 'danger' ? 'rgba(239,68,68,0.08)' : a.type === 'warning' ? 'rgba(245,158,11,0.08)' : 'rgba(59,130,246,0.06)',
          border: `1px solid ${a.type === 'danger' ? 'var(--negative)' : a.type === 'warning' ? 'var(--warning)' : 'var(--info)'}`,
          borderRadius: '10px', padding: '10px 16px', marginBottom: '10px', fontSize: '11px',
          color: a.type === 'danger' ? 'var(--negative)' : a.type === 'warning' ? 'var(--warning)' : 'var(--info)',
        }}>
          {a.type === 'danger' ? '🚨' : '⚠️'} {a.msg}
        </div>
      ))}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', marginBottom: '16px' }}>
        {[
          { label: 'Σύνολο Παγίων/μήνα', value: fe(calc.totalMonthly), color: 'var(--accent)', icon: '📊' },
          { label: 'Εκκρεμείς Πληρωμές', value: fe(calc.totalUnpaid), color: calc.totalUnpaid > 0 ? 'var(--negative)' : 'var(--positive)', icon: '⏳' },
          { label: 'Πληρωμένοι', value: fe(calc.totalPaid), color: 'var(--positive)', icon: '✅' },
          { label: 'Ετήσιο Κόστος', value: fe(calc.totalMonthly * 12), color: 'var(--warning)', icon: '📅' },
        ].map((k, i) => (
          <div key={i} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '14px 16px' }}>
            <div style={{ fontSize: '18px', marginBottom: '6px' }}>{k.icon}</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: k.color, fontFamily: "'JetBrains Mono',monospace", marginBottom: '4px' }}>{k.value}</div>
            <div style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <BillsPDFExport data={{
          propertyName: propertyName,
          propertyAddress: propertyAddress,
          bills,
          totalMonthly: calc.totalMonthly,
          totalAnnual: calc.totalMonthly * 12,
          avgMonthly: calc.avgMonthly,
          historyTotals: calc.historyTotals,
        }} />
        <button onClick={() => setShowForm(v => !v)}
          style={{ background: showForm ? 'transparent' : 'var(--accent)', color: showForm ? 'var(--text-secondary)' : 'var(--bg-base)', border: `1px solid ${showForm ? 'var(--border-subtle)' : 'var(--accent)'}`, borderRadius: '8px', padding: '9px 20px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
          {showForm ? '✕ Κλείσιμο' : '+ Προσθήκη Λογαριασμού'}
        </button>
      </div>

      {/* Add Form */}
      {showForm && (
        <div style={{ ...card, border: '1px solid var(--accent)', marginBottom: '20px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '18px' }}>✚ Νέος Λογαριασμός / Πάγιο</div>

          {/* Row 1: Category, Name, Amount, VAT */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 2fr 1fr 1.4fr', gap: '10px', marginBottom: '12px' }}>
            <CustomSelect label="Κατηγορία" value={form.category} onChange={v => sf('category', v)} options={CAT_OPTIONS} />
            <TextInput label="Ονομασία / Πάροχος" value={form.name} onChange={v => sf('name', v)} placeholder="π.χ. ΔΕΗ Πράσινο Ιουνίου..." />
            <div style={{ minWidth: 0 }}>
              <label style={{ fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>Ποσό (€)</label>
              <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: '8px', overflow: 'hidden' }}>
                <input type="number" value={form.amount} onChange={e => sf('amount', e.target.value)} placeholder="0.00"
                  style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', padding: '9px 10px', color: 'var(--text-primary)', fontSize: '13px', fontFamily: "'JetBrains Mono',monospace", outline: 'none' }} />
                <span style={{ padding: '0 10px', fontSize: '11px', color: 'var(--text-tertiary)', flexShrink: 0 }}>€</span>
              </div>
            </div>
            <CustomSelect label="ΦΠΑ" value={form.vat_rate} onChange={v => sf('vat_rate', v)} options={VAT_OPTIONS} />
          </div>

          {/* Row 2: Period, Due date, Type, Notes */}
          <div style={{ display: 'grid', gridTemplateColumns: form.period === 'custom' ? '1fr 1fr 1fr auto 1fr' : '1fr 1fr auto 1fr', gap: '10px', marginBottom: '12px', alignItems: 'flex-start' }}>
            <CustomSelect label="Περίοδος" value={form.period} onChange={v => sf('period', v)} options={PERIOD_OPTIONS} />
            {form.period === 'custom' && (
              <TextInput label="Προσαρμοσμένη Περίοδος" value={form.period_custom} onChange={v => sf('period_custom', v)} placeholder="π.χ. 01-15/06/2026" />
            )}
            <DatePicker label="Ημ. Λήξης" value={form.due_date} onChange={v => sf('due_date', v)} />
            <div style={{ paddingTop: '22px' }}>
              <Toggle on={form.recurring} onChange={v => sf('recurring', v)} label="📅 Πάγιο" labelOff="1️⃣ Εφάπαξ" />
            </div>
            <TextInput label="Σημειώσεις" value={form.notes} onChange={v => sf('notes', v)} placeholder="π.χ. δόση, ληξιπρόθεσμος..." />
          </div>

          {/* Electricity extras */}
          {form.category === 'electricity' && (
            <div style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '10px', padding: '14px', marginBottom: '12px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--warning)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>⚡ Λεπτομέρειες Λογαριασμού Ρεύματος</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', marginBottom: '8px' }}>
                {[
                  { label: 'Κατανάλωση', key: 'kwh', suffix: 'kWh' },
                  { label: 'ΕΡΤ', key: 'ert', suffix: '€' },
                  { label: 'ΕΤΜΕΑΡ', key: 'etmear', suffix: '€' },
                  { label: 'Δημοτικά', key: 'dimotika_amt', suffix: '€' },
                ].map(f => (
                  <div key={f.key} style={{ minWidth: 0 }}>
                    <label style={{ fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>{f.label} ({f.suffix})</label>
                    <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: '8px', overflow: 'hidden' }}>
                      <input type="number" value={(form as any)[f.key]} onChange={e => sf(f.key, e.target.value)} placeholder="0"
                        style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', padding: '9px 8px', color: 'var(--text-primary)', fontSize: '13px', fontFamily: "'JetBrains Mono',monospace", outline: 'none' }} />
                      <span style={{ padding: '0 8px', fontSize: '10px', color: 'var(--text-tertiary)', flexShrink: 0 }}>{f.suffix}</span>
                    </div>
                  </div>
                ))}
              </div>
              {form.amount && form.kwh && parseFloat(form.kwh) > 0 && (
                <div style={{ display: 'flex', gap: '20px', fontSize: '11px', flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--warning)' }}>Κόστος/kWh: <strong style={{ fontFamily: "'JetBrains Mono',monospace" }}>{(parseFloat(form.amount) / parseFloat(form.kwh)).toFixed(4)} €</strong></span>
                  {form.ert && form.etmear && form.dimotika_amt && (
                    <span style={{ color: 'var(--text-secondary)' }}>Καθαρή κατανάλωση: <strong style={{ color: 'var(--positive)', fontFamily: "'JetBrains Mono',monospace" }}>{(parseFloat(form.amount) - parseFloat(form.ert||'0') - parseFloat(form.etmear||'0') - parseFloat(form.dimotika_amt||'0')).toFixed(2)} €</strong></span>
                  )}
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button onClick={() => setShowForm(false)}
              style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '9px 16px', fontSize: '12px', cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
              Ακύρωση
            </button>
            <button onClick={addBill} disabled={!form.name || !form.amount || saving}
              style={{ background: (!form.name || !form.amount || saving) ? 'var(--bg-overlay)' : 'var(--accent)', color: (!form.name || !form.amount || saving) ? 'var(--text-tertiary)' : 'var(--bg-base)', border: 'none', borderRadius: '8px', padding: '9px 20px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
              {saving ? '⏳ Αποθήκευση...' : '✚ Προσθήκη'}
            </button>
          </div>
        </div>
      )}

      {/* Bills List */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', paddingBottom: '10px', borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: '16px' }}>📋</span>
          <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Λογαριασμοί & Πάγια</span>
          <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-tertiary)', background: 'var(--bg-elevated)', padding: '2px 10px', borderRadius: '20px' }}>{bills.length} εγγραφές</span>
        </div>

        {bills.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-tertiary)' }}>
            <div style={{ fontSize: '36px', marginBottom: '10px', opacity: 0.25 }}>🧾</div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '6px' }}>Δεν έχεις προσθέσει λογαριασμούς</div>
            <div style={{ fontSize: '10px' }}>Πάτα "+ Προσθήκη" για να ξεκινήσεις</div>
          </div>
        ) : (
          ['overdue', 'upcoming', 'paid'].map(group => {
            const groupBills = bills.filter(b => {
              const isOverdue = !b.paid && b.due_date && new Date(b.due_date) < today;
              if (group === 'overdue') return isOverdue;
              if (group === 'paid') return b.paid;
              return !isOverdue && !b.paid;
            });
            if (groupBills.length === 0) return null;
            const cfg = {
              overdue: { label: '🚨 Ληξιπρόθεσμοι', color: 'var(--negative)' },
              upcoming: { label: '⏳ Εκκρεμείς', color: 'var(--warning)' },
              paid: { label: '✅ Πληρωμένοι', color: 'var(--positive)' },
            }[group]!;
            return (
              <div key={group} style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '9px', fontWeight: 700, color: cfg.color, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '8px', paddingBottom: '4px', borderBottom: `1px solid ${cfg.color}30` }}>
                  {cfg.label} · {groupBills.length}
                </div>
                {groupBills.map(b => {
                  const c = cat(b.category);
                  const daysLeft = b.due_date ? Math.ceil((new Date(b.due_date).getTime() - today.getTime()) / 86400000) : null;
                  return (
                    <div key={b.id} style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto auto auto', gap: '12px', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border-subtle)', opacity: b.paid ? 0.55 : 1 }}>
                      <button onClick={() => togglePaid(b.id)}
                        style={{ width: '22px', height: '22px', borderRadius: '6px', border: `2px solid ${b.paid ? 'var(--positive)' : 'var(--border-default)'}`, background: b.paid ? 'var(--positive)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {b.paid && <span style={{ color: '#fff', fontSize: '11px', fontWeight: 700 }}>✓</span>}
                      </button>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap', marginBottom: '3px' }}>
                          <span style={{ fontSize: '15px' }}>{c.icon}</span>
                          <span style={{ fontSize: '12px', fontWeight: 600, textDecoration: b.paid ? 'line-through' : 'none', color: b.paid ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>{b.name}</span>
                          {b.recurring && <span style={{ fontSize: '8px', background: 'var(--bg-overlay)', color: 'var(--text-tertiary)', padding: '1px 6px', borderRadius: '3px', fontWeight: 600 }}>ΠΑΓΙΟ</span>}
                          <span style={{ fontSize: '8px', color: c.color, background: `${c.color}18`, padding: '1px 6px', borderRadius: '3px', fontWeight: 600 }}>{c.label}</span>
                          {b.vat_rate ? <span style={{ fontSize: '8px', color: 'var(--text-tertiary)', background: 'var(--bg-overlay)', padding: '1px 6px', borderRadius: '3px' }}>ΦΠΑ {b.vat_rate}%</span> : null}
                        </div>
                        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                          {b.period && <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>📅 {b.period}</span>}
                          {b.kwh && <span style={{ fontSize: '10px', color: 'var(--info)', fontFamily: "'JetBrains Mono',monospace" }}>{b.kwh} kWh</span>}
                          {b.due_date && <span style={{ fontSize: '10px', color: daysLeft !== null && daysLeft < 0 ? 'var(--negative)' : daysLeft !== null && daysLeft <= 7 ? 'var(--warning)' : 'var(--text-tertiary)' }}>
                            {daysLeft !== null && daysLeft < 0 ? `⚠ ${Math.abs(daysLeft)}ημ. καθυστέρηση` : daysLeft === 0 ? '⚠ Λήγει σήμερα' : daysLeft !== null ? `Λήγει σε ${daysLeft}ημ.` : new Date(b.due_date).toLocaleDateString('el-GR')}
                          </span>}
                          {b.notes && <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>• {b.notes}</span>}
                        </div>
                      </div>
                      <span style={{ fontSize: '15px', fontWeight: 700, color: b.paid ? 'var(--text-tertiary)' : 'var(--accent)', fontFamily: "'JetBrains Mono',monospace", whiteSpace: 'nowrap' }}>{fe(b.amount, 2)}</span>
                      {!b.paid && (
                        <button onClick={() => togglePaid(b.id)}
                          style={{ fontSize: '10px', color: 'var(--positive)', background: 'rgba(52,217,123,0.1)', border: '1px solid var(--positive)', borderRadius: '6px', padding: '5px 12px', cursor: 'pointer', fontFamily: 'Inter,sans-serif', whiteSpace: 'nowrap', fontWeight: 600 }}>
                          ✓ Πληρώθηκε
                        </button>
                      )}
                      <button onClick={() => deleteBill(b.id)}
                        style={{ width: '26px', height: '26px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.12)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--negative)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)'; }}>✕</button>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>

      {/* Smart Insights */}
      {calc.byCategory.length > 0 && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', paddingBottom: '10px', borderBottom: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '16px' }}>💡</span>
            <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Smart Insights</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '20px' }}>
            {[
              { label: 'Πάγια / τ.μ. / μήνα', value: calc.totalMonthly > 0 ? `${(calc.totalMonthly/35).toFixed(2)} €/τ.μ.` : '—', sub: 'Μ.Ο. αγοράς ~3.50 €/τ.μ.', color: calc.totalMonthly > 0 && (calc.totalMonthly/35) > 3.50 ? 'var(--negative)' : 'var(--positive)', icon: '📐' },
              { label: 'Μέσο Μηνιαίο', value: calc.avgMonthly > 0 ? `${Math.round(calc.avgMonthly)} €` : '—', sub: 'βάσει ιστορικού', color: 'var(--accent)', icon: '📊' },
              { label: 'Ακριβότερος μήνας', value: Math.max(...calc.historyTotals) > 0 ? `${Math.round(Math.max(...calc.historyTotals))} €` : '—', sub: MONTHS_GR[calc.historyTotals.indexOf(Math.max(...calc.historyTotals))] || '—', color: 'var(--negative)', icon: '📈' },
              { label: 'Εκκρεμείς', value: calc.overdue.length > 0 ? `${calc.overdue.length} λογ/σμοί` : '✓ Εντάξει', sub: calc.totalUnpaid > 0 ? `${calc.totalUnpaid.toFixed(2)} €` : 'Καμία εκκρεμότητα', color: calc.overdue.length > 0 ? 'var(--negative)' : 'var(--positive)', icon: calc.overdue.length > 0 ? '🚨' : '✅' },
            ].map((k, i) => (
              <div key={i} style={{ background: 'var(--bg-elevated)', borderRadius: '10px', padding: '14px', border: `1px solid ${k.color}22` }}>
                <div style={{ fontSize: '20px', marginBottom: '6px' }}>{k.icon}</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: k.color, fontFamily: "'JetBrains Mono',monospace", marginBottom: '4px' }}>{k.value}</div>
                <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>{k.label}</div>
                <div style={{ fontSize: '9px', color: 'var(--text-tertiary)' }}>{k.sub}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>Κατηγορίες vs Μέσος Όρος Αγοράς</div>
          {calc.byCategory.map(c => {
            const pct = c.benchmark > 0 ? (c.monthly / c.benchmark - 1) * 100 : 0;
            const isHigh = pct > 25;
            const barPct = c.benchmark > 0 ? Math.min(c.monthly / (c.benchmark * 2), 1) * 100 : 50;
            return (
              <div key={c.value} style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '15px' }}>{c.icon}</span>
                    <span style={{ fontSize: '11px', fontWeight: 600 }}>{c.label}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: "'JetBrains Mono',monospace" }}>{fe(c.monthly)}/μήνα</span>
                    {c.benchmark > 0 && <span style={{ fontSize: '10px', fontWeight: 700, color: isHigh ? 'var(--negative)' : pct < -10 ? 'var(--positive)' : 'var(--text-secondary)', fontFamily: "'JetBrains Mono',monospace", width: '50px', textAlign: 'right' }}>{pct > 0 ? '+' : ''}{pct.toFixed(0)}%</span>}
                    {c.benchmark > 0 && <span style={{ fontSize: '9px', color: 'var(--text-tertiary)', width: '60px' }}>μ.ο. {fe(c.benchmark)}</span>}
                  </div>
                </div>
                <div style={{ position: 'relative', height: '6px', background: 'var(--bg-overlay)', borderRadius: '3px' }}>
                  {c.benchmark > 0 && <div style={{ position: 'absolute', left: '50%', top: '-2px', width: '2px', height: '10px', background: 'var(--border-default)', borderRadius: '1px' }} />}
                  <div style={{ height: '100%', width: `${Math.min(barPct, 100)}%`, background: isHigh ? 'var(--negative)' : pct < -10 ? 'var(--positive)' : c.color, borderRadius: '3px', transition: 'width 0.5s' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 12-Month History */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', paddingBottom: '10px', borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: '16px' }}>📊</span>
          <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Ιστορικό {currentYear}</span>
        </div>
        <div style={{ position: 'relative', display: 'flex', gap: '5px', alignItems: 'flex-end', height: '90px', marginBottom: '8px' }}>
          {calc.avgMonthly > 0 && calc.maxHistory > 0 && (
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${(calc.avgMonthly / calc.maxHistory) * 78}px`, borderTop: '1px dashed var(--accent)', opacity: 0.4, zIndex: 1, pointerEvents: 'none' }}>
              <span style={{ position: 'absolute', right: 0, top: '-12px', fontSize: '8px', color: 'var(--accent)', background: 'var(--bg-surface)', padding: '0 4px', borderRadius: '3px' }}>μ.ο. {Math.round(calc.avgMonthly)}€</span>
            </div>
          )}
          {MONTHS_GR.map((m, i) => {
            const val = calc.historyTotals[i];
            const pct = val / calc.maxHistory;
            const isCurrent = i === currentMonth;
            const isHigh = val > 0 && calc.avgMonthly > 0 && val > calc.avgMonthly * 1.2;
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                {val > 0 && <div style={{ fontSize: '7px', color: isHigh ? 'var(--negative)' : 'var(--text-tertiary)', fontFamily: "'JetBrains Mono',monospace" }}>{Math.round(val)}</div>}
                <div style={{ width: '100%', height: `${Math.max(pct * 78, val > 0 ? 5 : 2)}px`, background: isCurrent ? 'var(--accent)' : isHigh ? 'rgba(239,68,68,0.65)' : 'var(--info)', borderRadius: '4px 4px 0 0', opacity: isCurrent ? 1 : 0.75, transition: 'height 0.35s' }} />
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: '5px', marginBottom: '16px' }}>
          {MONTHS_GR.map((m, i) => <div key={i} style={{ flex: 1, fontSize: '8px', color: i === currentMonth ? 'var(--accent)' : 'var(--text-tertiary)', textAlign: 'center', fontWeight: i === currentMonth ? 700 : 400 }}>{m}</div>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px', marginBottom: '16px' }}>
          {[
            { label: 'Μέσο Μηνιαίο', value: calc.avgMonthly > 0 ? `${Math.round(calc.avgMonthly)} €` : '—', color: 'var(--accent)' },
            { label: 'Ακριβότερος', value: Math.max(...calc.historyTotals) > 0 ? `${Math.round(Math.max(...calc.historyTotals))} €` : '—', color: 'var(--negative)' },
            { label: 'Φθηνότερος', value: calc.historyTotals.filter(t => t > 0).length > 0 ? `${Math.round(Math.min(...calc.historyTotals.filter(t => t > 0)))} €` : '—', color: 'var(--positive)' },
          ].map((k, i) => (
            <div key={i} style={{ background: 'var(--bg-elevated)', borderRadius: '8px', padding: '10px 14px' }}>
              <div style={{ fontSize: '15px', fontWeight: 700, color: k.color, fontFamily: "'JetBrains Mono',monospace" }}>{k.value}</div>
              <div style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginTop: '2px' }}>{k.label}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px' }}>Καταχώρηση Ιστορικού ανά Κατηγορία</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', minWidth: '900px' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-secondary)', fontWeight: 400, fontSize: '9px', textTransform: 'uppercase', borderBottom: '1px solid var(--border-subtle)', width: '120px' }}>Κατηγορία</th>
                {MONTHS_GR.map((m, i) => <th key={i} style={{ padding: '6px 4px', color: i === currentMonth ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: i === currentMonth ? 700 : 400, fontSize: '9px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'center' }}>{m}</th>)}
                <th style={{ padding: '6px 8px', color: 'var(--text-secondary)', fontWeight: 400, fontSize: '9px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'right' }}>Σύνολο</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.filter(c => c.value !== 'other').map(c => {
                const rowTotal = history[c.value]?.reduce((s, v) => s + (parseFloat(v) || 0), 0) || 0;
                return (
                  <tr key={c.value}>
                    <td style={{ padding: '4px 8px', color: 'var(--text-secondary)', fontSize: '10px', borderBottom: '1px solid var(--border-subtle)', whiteSpace: 'nowrap' }}>{c.icon} {c.label}</td>
                    {MONTHS_GR.map((m, i) => (
                      <td key={i} style={{ padding: '2px 2px', borderBottom: '1px solid var(--border-subtle)' }}>
                        <input type="number" value={history[c.value]?.[i] || ''} onChange={e => updateHistory(c.value, i, e.target.value)}
                          style={{ width: '100%', background: i === currentMonth ? 'rgba(212,175,66,0.07)' : 'var(--bg-base)', border: `1px solid ${i === currentMonth ? 'var(--accent)' : 'var(--border-subtle)'}`, borderRadius: '4px', padding: '4px 2px', color: 'var(--text-primary)', fontSize: '10px', fontFamily: "'JetBrains Mono',monospace", outline: 'none', textAlign: 'center', boxSizing: 'border-box' }} />
                      </td>
                    ))}
                    <td style={{ padding: '4px 8px', fontWeight: 700, color: rowTotal > 0 ? 'var(--accent)' : 'var(--text-tertiary)', fontFamily: "'JetBrains Mono',monospace", borderBottom: '1px solid var(--border-subtle)', textAlign: 'right', fontSize: '11px' }}>
                      {rowTotal > 0 ? fe(rowTotal) : '—'}
                    </td>
                  </tr>
                );
              })}
              <tr style={{ background: 'var(--bg-elevated)' }}>
                <td style={{ padding: '8px', fontWeight: 700, fontSize: '11px' }}>Σύνολο</td>
                {calc.historyTotals.map((t, i) => (
                  <td key={i} style={{ padding: '5px 2px', fontWeight: 700, color: t > 0 ? (t > calc.avgMonthly * 1.2 ? 'var(--negative)' : 'var(--positive)') : 'var(--text-tertiary)', fontFamily: "'JetBrains Mono',monospace", textAlign: 'center', fontSize: '10px' }}>
                    {t > 0 ? Math.round(t) : '—'}
                  </td>
                ))}
                <td style={{ padding: '8px', fontWeight: 700, color: 'var(--warning)', fontFamily: "'JetBrains Mono',monospace", textAlign: 'right', fontSize: '11px' }}>
                  {fe(calc.historyTotals.reduce((a, b) => a + b, 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Calendar */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', paddingBottom: '10px', borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: '16px' }}>📅</span>
          <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Ημερολόγιο Πληρωμών — {MONTHS_GR[currentMonth]}</span>
        </div>
        {bills.filter(b => b.due_date && new Date(b.due_date).getMonth() === currentMonth).length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-tertiary)', fontSize: '11px' }}>Δεν υπάρχουν λογαριασμοί με ημ. λήξης αυτόν τον μήνα</div>
        ) : (
          Array.from({ length: 31 }, (_, d) => d + 1).map(day => {
            const dayBills = bills.filter(b => { if (!b.due_date) return false; const d = new Date(b.due_date); return d.getMonth() === currentMonth && d.getDate() === day; });
            if (dayBills.length === 0) return null;
            const isToday = today.getDate() === day && today.getMonth() === currentMonth;
            return (
              <div key={day} style={{ display: 'flex', gap: '12px', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)', alignItems: 'center' }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: isToday ? 'var(--accent)' : 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px', color: isToday ? 'var(--bg-base)' : 'var(--text-primary)', flexShrink: 0 }}>{day}</div>
                <div style={{ flex: 1 }}>
                  {dayBills.map(b => {
                    const c = cat(b.category);
                    return (
                      <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                        <span style={{ fontSize: '11px', color: b.paid ? 'var(--text-tertiary)' : 'var(--text-primary)', textDecoration: b.paid ? 'line-through' : 'none' }}>{c.icon} {b.name}</span>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: b.paid ? 'var(--positive)' : 'var(--accent)', fontFamily: "'JetBrains Mono',monospace" }}>{fe(b.amount, 2)}</span>
                          <span style={{ fontSize: '8px', padding: '1px 6px', borderRadius: '3px', background: b.paid ? 'rgba(52,217,123,0.1)' : 'rgba(239,68,68,0.1)', color: b.paid ? 'var(--positive)' : 'var(--negative)' }}>{b.paid ? '✓' : 'ΕΚΚΡΕΜΕΣ'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}