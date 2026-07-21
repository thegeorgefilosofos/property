'use client';

// ═══════════════════════════════════════════════════════════════════════════
// JournalExport — Λογιστικό handoff (P2). Χτίζει από τα έσοδα/έξοδα της περιόδου
// ισοσκελισμένο double-entry ημερολόγιο (lib/accounting/journal) και:
//   • το εξάγει σε journal CSV για Soft1/Epsilon (γενικό), QuickBooks, ή Xero,
//   • δείχνει Ισοζύγιο (trial balance) + audit-grade tie-out (Χρέωση = Πίστωση,
//     Ενεργητικό = Καθαρή θέση) ώστε ο λογιστής να «κλείνει» με σιγουριά.
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { T, TT, Btn, Badge } from '@/components/Theme';
import {
  buildJournal, journalTotals, trialBalance, journalToCsv,
  type JournalFormat, type IncomeRec, type ExpenseRec,
} from '@/lib/accounting/journal';

interface Prop { id: string; name: string }
const MONTHS = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];
const FORMATS: { key: JournalFormat; label: string; hint: string; ext: string }[] = [
  { key: 'generic', label: 'Soft1 / Epsilon', hint: 'Ελληνικό ημερολόγιο (;), χρέωση/πίστωση', ext: 'csv' },
  { key: 'quickbooks', label: 'QuickBooks', hint: 'Journal import (Date, Account, Debit, Credit)', ext: 'csv' },
  { key: 'xero', label: 'Xero', hint: 'Manual Journal template (signed amounts)', ext: 'csv' },
];
const eur = (n: number) => `${(n || 0).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export default function JournalExport({ open, onClose, userId, supabase }: {
  open: boolean; onClose: () => void; userId: string; supabase: SupabaseClient;
}) {
  const nowYear = new Date().getFullYear();
  const [props, setProps] = useState<Prop[]>([]);
  const [propIds, setPropIds] = useState<Set<string>>(new Set());
  const [year, setYear] = useState(nowYear);
  const [month, setMonth] = useState(0);
  const [format, setFormat] = useState<JournalFormat>('generic');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [preview, setPreview] = useState<ReturnType<typeof trialBalance> | null>(null);
  const [totals, setTotals] = useState<{ debit: number; credit: number; balanced: boolean } | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase.from('user_properties').select('id,name').eq('user_id', userId).order('name')
      .then(({ data }) => { const ps = (data || []) as Prop[]; setProps(ps); setPropIds(prev => prev.size ? prev : new Set(ps.map(p => p.id))); setLoading(false); });
  }, [open, userId, supabase]);

  const yearsAvail = useMemo(() => Array.from({ length: 7 }, (_, i) => nowYear - i), [nowYear]);
  const selIds = useMemo(() => props.filter(p => propIds.has(p.id)).map(p => p.id), [props, propIds]);
  const toggle = (id: string) => setPropIds(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  useEffect(() => { setPreview(null); setTotals(null); }, [year, month, propIds]);
  if (!open) return null;

  const periodLabel = month === 0 ? `${year}` : `${MONTHS[month - 1]} ${year}`;

  // Άντληση + χτίσιμο ημερολογίου (κοινό για preview & download).
  const gather = async () => {
    const nameById = new Map(props.filter(p => propIds.has(p.id)).map(p => [p.id, p.name]));
    const from = `${year}-${String(month || 1).padStart(2, '0')}-01`;
    const to = month > 0 ? `${year}-${String(month).padStart(2, '0')}-31` : `${year}-12-31`;
    let rentQ = supabase.from('rent_payments').select('property_id,period_year,period_month,amount,paid,paid_date,due_date')
      .in('property_id', selIds).eq('paid', true).eq('period_year', year);
    if (month > 0) rentQ = rentQ.eq('period_month', month);
    const [{ data: rentData }, { data: expData }] = await Promise.all([
      rentQ,
      supabase.from('expenses').select('property_id,date,amount,category,description').in('property_id', selIds).gte('date', from).lte('date', to),
    ]);
    const incomes: IncomeRec[] = (rentData || []).map((r: any) => ({
      date: r.paid_date || r.due_date || `${r.period_year}-${String(r.period_month || 1).padStart(2, '0')}-01`,
      amount: Number(r.amount) || 0, property: r.property_id ? nameById.get(r.property_id) : undefined,
    }));
    const expenses: ExpenseRec[] = (expData || []).map((e: any) => ({
      date: e.date, amount: Number(e.amount) || 0, category: e.category, description: e.description,
      property: e.property_id ? nameById.get(e.property_id) : undefined,
    }));
    return buildJournal({ incomes, expenses });
  };

  const doPreview = async () => {
    setErr(''); if (!selIds.length) { setErr('Διάλεξε τουλάχιστον ένα ακίνητο.'); return; }
    setBusy(true);
    try { const lines = await gather(); setPreview(trialBalance(lines)); setTotals(journalTotals(lines)); }
    catch (e: any) { setErr(e?.message || 'Αποτυχία υπολογισμού.'); }
    finally { setBusy(false); }
  };

  const download = async () => {
    setErr(''); if (!selIds.length) { setErr('Διάλεξε τουλάχιστον ένα ακίνητο.'); return; }
    setBusy(true);
    try {
      const lines = await gather();
      if (!lines.length) { setErr('Δεν υπάρχουν εγγραφές εσόδων/εξόδων για την περίοδο.'); setBusy(false); return; }
      const csv = journalToCsv(lines, format, `Property OS — Ημερολόγιο ${periodLabel}`);
      // BOM ώστε το Excel να ανοίγει σωστά τα ελληνικά (UTF-8).
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `Ημερολόγιο_${format}_${periodLabel}.csv`.replace(/\s+/g, '_');
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      setPreview(trialBalance(lines)); setTotals(journalTotals(lines));
    } catch (e: any) { setErr(e?.message || 'Αποτυχία εξαγωγής.'); }
    finally { setBusy(false); }
  };

  const field: React.CSSProperties = { height: 40, padding: '0 12px', borderRadius: T.radius.inner, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 14, fontFamily: T.font.sans, outline: 'none', boxSizing: 'border-box' };
  const pill = (on: boolean): React.CSSProperties => ({ fontSize: 12, fontWeight: 600, padding: '8px 12px', borderRadius: T.radius.inner, cursor: 'pointer', textAlign: 'left', border: `1px solid ${on ? 'var(--accent-border)' : 'var(--border-default)'}`, background: on ? 'var(--accent-soft)' : 'transparent', color: on ? 'var(--accent)' : 'var(--text-secondary)', fontFamily: T.font.sans });

  // Cash-basis balance sheet tie-out: Ταμείο (38.00) = Καθαρό αποτέλεσμα.
  const cash = preview?.find(r => r.code === '38.00')?.balance ?? 0;
  const revenue = Math.abs(preview?.find(r => r.code === '75.00')?.balance ?? 0);
  const netProfit = totals ? cash : 0;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 18, width: 'min(760px, 100%)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: 'var(--elev-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 24px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4z"/><path d="M4 10h16M10 4v16"/></svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...TT.h2 }}>Λογιστικό ημερολόγιο</div>
            <div style={{ ...TT.bodySm, marginTop: 1 }}>Διπλογραφικό journal για τον λογιστή — Soft1 · Epsilon · QuickBooks · Xero</div>
          </div>
          <button onClick={onClose} aria-label="Κλείσιμο" style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: 4 }}>×</button>
        </div>

        <div style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <div style={{ ...TT.label, marginBottom: 8 }}>Περίοδος</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ ...field, minWidth: 110 }}>{yearsAvail.map(y => <option key={y} value={y}>{y}</option>)}</select>
              <select value={month} onChange={e => setMonth(Number(e.target.value))} style={{ ...field, minWidth: 150 }}><option value={0}>Όλο το έτος</option>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ ...TT.label }}>Ακίνητα</div>
              {props.length > 0 && <div style={{ display: 'flex', gap: 6 }}><button onClick={() => setPropIds(new Set(props.map(p => p.id)))} style={{ ...TT.caption, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontWeight: 700 }}>Όλα</button><button onClick={() => setPropIds(new Set())} style={{ ...TT.caption, background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontWeight: 700 }}>Κανένα</button></div>}
            </div>
            {loading ? <div style={{ ...TT.bodySm }}>Φόρτωση…</div> : props.length === 0 ? <div style={{ ...TT.bodySm }}>Δεν υπάρχουν ακίνητα.</div> : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 210px), 1fr))', gap: 8 }}>
                {props.map(p => <button key={p.id} onClick={() => toggle(p.id)} style={pill(propIds.has(p.id))}><span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span></button>)}
              </div>
            )}
          </div>

          <div>
            <div style={{ ...TT.label, marginBottom: 8 }}>Μορφή αρχείου</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))', gap: 8 }}>
              {FORMATS.map(f => (
                <button key={f.key} onClick={() => setFormat(f.key)} style={{ ...pill(format === f.key), display: 'block' }}>
                  <span style={{ display: 'block', fontWeight: 700 }}>{f.label}</span>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2, fontWeight: 400 }}>{f.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Ισοζύγιο & tie-out */}
          {preview && totals && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ ...TT.label }}>Ισοζύγιο & έλεγχος</div>
                <Badge tone={totals.balanced ? 'positive' : 'negative'}>{totals.balanced ? 'Ισοσκελισμένο ✓' : 'Ασυμφωνία'}</Badge>
              </div>
              <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, padding: '8px 14px', background: 'var(--bg-elevated)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-tertiary)' }}>
                  <span>Λογαριασμός</span><span style={{ textAlign: 'right' }}>Χρέωση</span><span style={{ textAlign: 'right' }}>Πίστωση</span>
                </div>
                {preview.map(r => (
                  <div key={r.code} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, padding: '8px 14px', borderTop: '1px solid var(--border-subtle)', fontSize: 12.5 }}>
                    <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><span style={{ fontFamily: T.font.mono, color: 'var(--text-tertiary)', marginRight: 8 }}>{r.code}</span>{r.account}</span>
                    <span style={{ textAlign: 'right', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{r.debit ? eur(r.debit) : '—'}</span>
                    <span style={{ textAlign: 'right', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{r.credit ? eur(r.credit) : '—'}</span>
                  </div>
                ))}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, padding: '10px 14px', borderTop: '2px solid var(--border-default)', fontSize: 13, fontWeight: 700 }}>
                  <span>Σύνολα</span>
                  <span style={{ textAlign: 'right', fontFamily: T.font.mono }}>{eur(totals.debit)}</span>
                  <span style={{ textAlign: 'right', fontFamily: T.font.mono }}>{eur(totals.credit)}</span>
                </div>
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Tie-out (ταμειακή βάση): <b>Ενεργητικό (Ταμείο)</b> {eur(cash)} = <b>Καθαρό αποτέλεσμα</b> {eur(netProfit)}. Έσοδα περιόδου {eur(revenue)}.
              </div>
            </div>
          )}

          {err && <div style={{ fontSize: 12.5, color: 'var(--negative)', background: 'var(--negative-soft)', border: '1px solid var(--negative-border)', borderRadius: 10, padding: '10px 14px' }}>{err}</div>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 24px', borderTop: '1px solid var(--border-subtle)', flexShrink: 0, flexWrap: 'wrap' }}>
          <span style={{ ...TT.bodySm }}>{selIds.length} ακίν. · {periodLabel}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="secondary" onClick={doPreview} disabled={busy || !selIds.length}>{busy ? '…' : 'Έλεγχος ισοζυγίου'}</Btn>
            <Btn variant="primary" onClick={download} disabled={busy || !selIds.length}>{busy ? 'Εξαγωγή…' : 'Λήψη CSV'}</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
