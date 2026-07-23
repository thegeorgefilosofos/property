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
  buildJournal, journalTotals, trialBalance, journalToCsv, auditJournal,
  type JournalFormat, type IncomeRec, type ExpenseRec, type JournalAudit, type LoanPaymentRec,
} from '@/lib/accounting/journal';
import { downloadJournalWorkbook } from './journalXlsx';
import { annuityMonthly } from '@/lib/loans/recommend';

// Δόση δανείου (από περιγραφή/κατηγορία εξόδου) — ελληνικά & αγγλικά.
const LOAN_RE = /δάνει|δόσ\w*\s*δάν|τοκοχρε|χρεολ|loan|installment|mortgage|στεγαστ/i;
interface LoanRow { property_id: string | null; loan_amount: number | null; rate_type: string | null; fixed_rate: number | null; euribor: number | null; spread: number | null; years: number | null; start_date: string | null }
interface ExpRow { property_id: string | null; date: string; amount: number | string | null; category: string | null; description: string | null }
const loanAnnualRate = (l: LoanRow) => l.rate_type === 'variable' ? (Number(l.euribor || 0) + Number(l.spread || 0)) : Number(l.fixed_rate || 0);
// Τόκος της δόσης = υπόλοιπο κεφαλαίου πριν τη δόση × μηνιαίο επιτόκιο (clamped στο ποσό).
function loanInterestForPayment(l: LoanRow, isoDate: string, payment: number): number {
  const principal = Number(l.loan_amount || 0), years = Number(l.years || 0), annual = loanAnnualRate(l);
  if (!principal || !annual || !years) return 0;
  const r = annual / 100 / 12, n = years * 12;
  const pay = annuityMonthly(principal, annual, years);
  let t = 0;
  if (l.start_date) { const s = new Date(l.start_date), d = new Date(isoDate); t = Math.max(0, (d.getUTCFullYear() - s.getUTCFullYear()) * 12 + (d.getUTCMonth() - s.getUTCMonth())); }
  t = Math.min(t, Math.max(0, n - 1));
  const g = Math.pow(1 + r, t);
  const balBefore = principal * g - pay * ((g - 1) / r); // υπόλοιπο πριν τη δόση t+1
  return Math.max(0, Math.min(payment, Math.round(balBefore * r * 100) / 100));
}

type ExportFormat = JournalFormat | 'excel';
interface Prop { id: string; name: string }
const MONTHS = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];
const FORMATS: { key: ExportFormat; label: string; hint: string; ext: string }[] = [
  { key: 'excel', label: 'Excel · λογιστικό βιβλίο', hint: 'Ημερολόγιο, ισοζύγιο και έλεγχος σε ένα αρχείο. Μορφή €, φίλτρα, ζωντανές φόρμουλες.', ext: 'xlsx' },
  { key: 'generic', label: 'Soft1 / Epsilon', hint: 'Ελληνικό ημερολόγιο άρθρων: αριθμημένα άρθρα, χρέωση/πίστωση, έτοιμο για εισαγωγή.', ext: 'csv' },
  { key: 'quickbooks', label: 'QuickBooks', hint: 'Journal Entry: άρθρα με Journal No, Debits/Credits, MM/DD/YYYY.', ext: 'csv' },
  { key: 'xero', label: 'Xero', hint: 'Manual Journal: προσημασμένα ποσά ανά άρθρο, DD/MM/YYYY.', ext: 'csv' },
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
  const [format, setFormat] = useState<ExportFormat>('excel');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [preview, setPreview] = useState<ReturnType<typeof trialBalance> | null>(null);
  const [totals, setTotals] = useState<{ debit: number; credit: number; balanced: boolean } | null>(null);
  const [audit, setAudit] = useState<JournalAudit | null>(null);
  const [showChecks, setShowChecks] = useState(false);

  // «Ρώτησε τον βοηθό» — ανοίγει τον βοηθό με προ-συμπληρωμένη ερώτηση για το εύρημα
  // και κλείνει το modal ώστε να φανεί ο βοηθός.
  const askAssistant = (c: { label: string; detail: string; fix?: string }) => {
    const q = `Στο λογιστικό ημερολόγιο, στον έλεγχο «${c.label}»: ${c.detail}${c.fix ? ` (${c.fix})` : ''} Εξήγησέ μου απλά τι σημαίνει και πώς το διορθώνω.`;
    window.dispatchEvent(new CustomEvent('pos:ask', { detail: { q } }));
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase.from('user_properties').select('id,name').eq('user_id', userId).order('name')
      .then(({ data }) => { const ps = (data || []) as Prop[]; setProps(ps); setPropIds(prev => prev.size ? prev : new Set(ps.map(p => p.id))); setLoading(false); });
  }, [open, userId, supabase]);

  const yearsAvail = useMemo(() => Array.from({ length: 7 }, (_, i) => nowYear - i), [nowYear]);
  const selIds = useMemo(() => props.filter(p => propIds.has(p.id)).map(p => p.id), [props, propIds]);
  const toggle = (id: string) => setPropIds(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  useEffect(() => { setPreview(null); setTotals(null); setAudit(null); setShowChecks(false); }, [year, month, propIds]);
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
    const [{ data: rentData }, { data: expData }, { data: loanData }] = await Promise.all([
      rentQ,
      supabase.from('expenses').select('property_id,date,amount,category,description').in('property_id', selIds).gte('date', from).lte('date', to),
      supabase.from('loans').select('property_id,loan_amount,rate_type,fixed_rate,euribor,spread,years,start_date').eq('user_id', userId),
    ]);
    const incomes: IncomeRec[] = (rentData || []).map((r: any) => ({
      date: r.paid_date || r.due_date || `${r.period_year}-${String(r.period_month || 1).padStart(2, '0')}-01`,
      amount: Number(r.amount) || 0, property: r.property_id ? nameById.get(r.property_id) : undefined,
    }));

    // Χωρίζουμε τα έξοδα-δόσεις δανείου από τα κανονικά έξοδα, ώστε να καταχωρηθούν
    // διπλογραφικά σωστά (τόκοι 65 + χρεολύσιο 45), όχι σαν απλό έξοδο.
    const loans = (loanData || []) as LoanRow[];
    const loanFor = (propId: string | null): LoanRow | undefined =>
      loans.find(l => l.property_id && l.property_id === propId) || (loans.length === 1 ? loans[0] : undefined);
    const isLoan = (e: ExpRow) => LOAN_RE.test(`${e.category || ''} ${e.description || ''}`);

    const expenses: ExpenseRec[] = [];
    const loanPayments: LoanPaymentRec[] = [];
    for (const e of (expData || []) as ExpRow[]) {
      const amount = Number(e.amount) || 0;
      const property = e.property_id ? nameById.get(e.property_id) : undefined;
      if (amount && isLoan(e)) {
        const loan = loanFor(e.property_id);
        const interest = loan ? loanInterestForPayment(loan, e.date, amount) : 0;
        loanPayments.push({ date: e.date, amount, interest, description: e.description || 'Δόση δανείου', property });
      } else {
        expenses.push({ date: e.date, amount, category: e.category ?? undefined, description: e.description ?? undefined, property });
      }
    }
    return buildJournal({ incomes, expenses, loanPayments });
  };

  const applyChecks = (lines: ReturnType<typeof buildJournal>) => {
    setPreview(trialBalance(lines)); setTotals(journalTotals(lines));
    setAudit(auditJournal(lines, { year, month }));
  };

  const doPreview = async () => {
    setErr(''); if (!selIds.length) { setErr('Διάλεξε τουλάχιστον ένα ακίνητο.'); return; }
    setBusy(true);
    try {
      const lines = await gather();
      if (!lines.length) { setErr('Δεν υπάρχουν εγγραφές εσόδων/εξόδων για την περίοδο.'); setPreview(null); setTotals(null); setAudit(null); return; }
      applyChecks(lines);
    }
    catch (e: any) { setErr(e?.message || 'Αποτυχία υπολογισμού.'); }
    finally { setBusy(false); }
  };

  const download = async () => {
    setErr(''); if (!selIds.length) { setErr('Διάλεξε τουλάχιστον ένα ακίνητο.'); return; }
    setBusy(true);
    try {
      const lines = await gather();
      if (!lines.length) { setErr('Δεν υπάρχουν εγγραφές εσόδων/εξόδων για την περίοδο.'); setBusy(false); return; }
      if (format === 'excel') {
        downloadJournalWorkbook({ lines, periodLabel, entityName: 'Property OS', year, month });
      } else {
        const csv = journalToCsv(lines, format, `Property OS — Ημερολόγιο ${periodLabel}`);
        // BOM ώστε το Excel να ανοίγει σωστά τα ελληνικά (UTF-8).
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `Ημερολόγιο_${format}_${periodLabel}.csv`.replace(/\s+/g, '_');
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      }
      applyChecks(lines);
    } catch (e: any) { setErr(e?.message || 'Αποτυχία εξαγωγής.'); }
    finally { setBusy(false); }
  };

  const field: React.CSSProperties = { height: 40, padding: '0 12px', borderRadius: T.radius.inner, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 14, fontFamily: T.font.sans, outline: 'none', boxSizing: 'border-box' };
  const pill = (on: boolean): React.CSSProperties => ({ fontSize: 12, fontWeight: 600, padding: '8px 12px', borderRadius: T.radius.inner, cursor: 'pointer', textAlign: 'left', border: `1px solid ${on ? 'var(--accent-border)' : 'var(--border-default)'}`, background: on ? 'var(--accent-soft)' : 'transparent', color: on ? 'var(--accent)' : 'var(--text-secondary)', fontFamily: T.font.sans });

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 18, width: 'min(760px, 100%)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: 'var(--elev-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 24px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4z"/><path d="M4 10h16M10 4v16"/></svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...TT.h2 }}>Λογιστικό ημερολόγιο</div>
            <div style={{ ...TT.bodySm, marginTop: 1 }}>Διπλογραφικό, έτοιμο για τον λογιστή · Soft1 · Epsilon · QuickBooks · Xero</div>
          </div>
          <button onClick={onClose} aria-label="Κλείσιμο" style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: 4 }}>×</button>
        </div>

        <div style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <div style={{ ...TT.label, marginBottom: 8 }}>ΠΕΡΙΟΔΟΣ</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ ...field, minWidth: 110 }}>{yearsAvail.map(y => <option key={y} value={y}>{y}</option>)}</select>
              <select value={month} onChange={e => setMonth(Number(e.target.value))} style={{ ...field, minWidth: 150 }}><option value={0}>Όλο το έτος</option>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ ...TT.label }}>ΑΚΙΝΗΤΑ</div>
              {props.length > 0 && <div style={{ display: 'flex', gap: 6 }}><button onClick={() => setPropIds(new Set(props.map(p => p.id)))} style={{ ...TT.caption, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontWeight: 700 }}>Όλα</button><button onClick={() => setPropIds(new Set())} style={{ ...TT.caption, background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontWeight: 700 }}>Κανένα</button></div>}
            </div>
            {loading ? <div style={{ ...TT.bodySm }}>Φόρτωση…</div> : props.length === 0 ? <div style={{ ...TT.bodySm }}>Δεν υπάρχουν ακίνητα.</div> : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 210px), 1fr))', gap: 8 }}>
                {props.map(p => <button key={p.id} onClick={() => toggle(p.id)} style={pill(propIds.has(p.id))}><span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span></button>)}
              </div>
            )}
          </div>

          <div>
            <div style={{ ...TT.label, marginBottom: 8 }}>ΜΟΡΦΗ</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))', gap: 8 }}>
              {FORMATS.map(f => (
                <button key={f.key} onClick={() => setFormat(f.key)} style={{ ...pill(format === f.key), display: 'block' }}>
                  <span style={{ display: 'block', fontWeight: 700 }}>{f.label}</span>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2, fontWeight: 400 }}>{f.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Ισοζύγιο & έλεγχος */}
          {preview && totals && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ ...TT.label }}>ΙΣΟΖΥΓΙΟ</div>
                <Badge tone={audit ? (audit.tone === 'positive' ? 'neutral' : audit.tone) : (totals.balanced ? 'neutral' : 'negative')}>{audit ? (audit.tone === 'positive' ? 'Ισοσκελισμένο' : audit.tone === 'warning' ? 'Ισοσκελισμένο · προσοχή' : 'Απαιτεί διόρθωση') : (totals.balanced ? 'Ισοσκελισμένο' : 'Ασυμφωνία')}</Badge>
              </div>
              <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 13, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, padding: '10px 16px', background: 'var(--bg-elevated)', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-tertiary)' }}>
                  <span>ΛΟΓΑΡΙΑΣΜΟΣ</span><span style={{ textAlign: 'right' }}>ΧΡΕΩΣΗ</span><span style={{ textAlign: 'right' }}>ΠΙΣΤΩΣΗ</span>
                </div>
                {preview.map(r => (
                  <div key={r.code} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, padding: '9px 16px', borderTop: '1px solid var(--border-subtle)', fontSize: 12.5 }}>
                    <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><span style={{ fontFamily: T.font.mono, fontSize: 11.5, color: 'var(--text-tertiary)', marginRight: 10 }}>{r.code}</span>{r.account}</span>
                    <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.debit ? eur(r.debit) : ''}</span>
                    <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.credit ? eur(r.credit) : ''}</span>
                  </div>
                ))}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, padding: '12px 16px', borderTop: '1px solid var(--border-default)', background: 'var(--bg-elevated)', fontSize: 13, fontWeight: 700 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>ΣΥΝΟΛΑ</span>
                  <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{eur(totals.debit)}</span>
                  <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{eur(totals.credit)}</span>
                </div>
              </div>

              {/* Υπογραφή — αλφάδι ισοσκέλισης (Χρέωση = Πίστωση) */}
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <div style={{ position: 'relative', width: '100%', height: 12 }}>
                  <span style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1.5, transform: 'translateY(-50%)', background: 'var(--border-default)' }} />
                  <span style={{ position: 'absolute', top: '50%', right: '50%', width: 'calc(50% - 7px)', height: 1.5, transform: 'translateY(-50%)', background: totals.balanced ? 'var(--text-tertiary)' : 'var(--negative)' }} />
                  <span style={{ position: 'absolute', top: '50%', left: '50%', width: 'calc(50% - 7px)', height: 1.5, transform: 'translateY(-50%)', background: totals.balanced ? 'var(--text-tertiary)' : 'var(--negative)' }} />
                  <span style={{ position: 'absolute', top: '50%', left: '50%', width: 9, height: 9, transform: 'translate(-50%,-50%) rotate(45deg)', background: 'var(--bg-surface)', border: `1.5px solid ${totals.balanced ? 'var(--text-secondary)' : 'var(--negative)'}` }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)' }}>Χρέωση <span style={{ fontWeight: 700, color: 'var(--text-tertiary)' }}>=</span> Πίστωση · {totals.balanced ? 'ισοσκελισμένο' : 'ασυμφωνία'}</span>
              </div>

              {audit && (() => {
                const toneVar = audit.tone === 'positive' ? 'var(--border-default)' : audit.tone === 'warning' ? 'var(--warning)' : 'var(--negative)';
                const pass = audit.checks.filter(c => c.status === 'pass').length;
                const warn = audit.checks.filter(c => c.status === 'warn').length;
                const fail = audit.checks.filter(c => c.status === 'fail').length;
                return (
                  <div style={{ marginTop: 18 }}>
                    {/* Ετυμηγορία — ήρεμη, σαν λογιστής */}
                    <div style={{ paddingLeft: 14, borderLeft: `2px solid ${toneVar}` }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.55 }}>{audit.summary}</div>
                    </div>

                    {/* Αναλυτικοί έλεγχοι — μαζεύουν από default */}
                    <div style={{ marginTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
                      <button onClick={() => setShowChecks(s => !s)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '13px 2px 4px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: T.font.sans, fontSize: 12, color: 'var(--text-secondary)' }}>
                        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-tertiary)', transform: showChecks ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}><path d="M9 6l6 6-6 6"/></svg>
                        Αναλυτικοί έλεγχοι
                        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 12, fontWeight: 600 }}>
                          <span style={{ color: 'var(--text-tertiary)' }}>{pass} εντάξει</span>
                          {warn > 0 && <span style={{ color: 'var(--warning-on-container)' }}>{warn} προσοχή</span>}
                          {fail > 0 && <span style={{ color: 'var(--negative)' }}>{fail} σφάλμα</span>}
                        </span>
                      </button>
                      {showChecks && (
                        <div style={{ padding: '4px 0 2px' }}>
                          {audit.checks.map((c, i) => {
                            const isPass = c.status === 'pass';
                            const col = c.status === 'warn' ? 'var(--warning)' : 'var(--negative)';
                            const ink = c.status === 'warn' ? 'var(--warning-on-container)' : 'var(--negative)';
                            return (
                              <div key={c.key} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 14, alignItems: 'start', padding: '11px 2px', borderTop: i ? '1px solid var(--border-subtle)' : 'none' }}>
                                <span style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: 12.5, fontWeight: 560, color: 'var(--text-primary)' }}>{c.label}</div>
                                  <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 3, lineHeight: 1.5 }}>{c.detail}</div>
                                  {!isPass && c.fix && (
                                    <>
                                      <div style={{ marginTop: 9, display: 'flex', gap: 8, alignItems: 'flex-start', padding: '9px 11px', borderRadius: 9, background: 'var(--bg-elevated)' }}>
                                        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-tertiary)', flexShrink: 0, marginTop: 1 }}><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2h6c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z"/></svg>
                                        <span style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--text-secondary)' }}><b style={{ color: 'var(--text-primary)', fontWeight: 640 }}>Πρόταση:</b> {c.fix}</span>
                                      </div>
                                      <button onClick={() => askAssistant(c)} style={{ marginTop: 7, background: 'none', border: 'none', padding: 0, fontFamily: T.font.sans, fontSize: 11.5, fontWeight: 650, color: 'var(--accent)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15l-1.9-4.1L5.5 9l4.6-1.4z"/></svg>
                                        Ρώτησε τον βοηθό
                                      </button>
                                    </>
                                  )}
                                </span>
                                <span style={{ flexShrink: 0, marginTop: 1, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, ...(isPass ? { color: 'var(--text-tertiary)' } : { color: ink, background: `color-mix(in srgb, ${col} 12%, transparent)`, padding: '3px 10px', borderRadius: 100 }) }}>
                                  {isPass && <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>}
                                  {c.status === 'pass' ? 'Εντάξει' : c.status === 'warn' ? 'Προσοχή' : 'Σφάλμα'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {err && <div style={{ fontSize: 12.5, color: 'var(--negative)', background: 'var(--negative-soft)', border: '1px solid var(--negative-border)', borderRadius: 10, padding: '10px 14px' }}>{err}</div>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 24px', borderTop: '1px solid var(--border-subtle)', flexShrink: 0, flexWrap: 'wrap' }}>
          <span style={{ ...TT.bodySm }}>{selIds.length} {selIds.length === 1 ? 'ακίνητο' : 'ακίνητα'} · {periodLabel}</span>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button onClick={e => { e.currentTarget.blur(); doPreview(); }} disabled={busy || !selIds.length}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 13px', borderRadius: T.radius.btn, background: 'none', border: 'none', fontFamily: T.font.sans, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', cursor: (busy || !selIds.length) ? 'not-allowed' : 'pointer', opacity: (busy || !selIds.length) ? 0.5 : 1, transition: 'background 0.15s, color 0.15s' }}
              onMouseEnter={e => { if (!(busy || !selIds.length)) { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)'; } }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-secondary)'; }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>
              {busy ? 'Έλεγχος…' : preview ? 'Επανέλεγχος' : 'Έλεγχος ισοζυγίου'}
            </button>
            <Btn variant="primary" onClick={download} disabled={busy || !selIds.length}>{busy ? 'Εξαγωγή…' : (format === 'excel' ? 'Λήψη Excel' : 'Λήψη CSV')}</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
