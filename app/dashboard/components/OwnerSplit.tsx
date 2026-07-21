'use client';

// ═══════════════════════════════════════════════════════════════════════════
// OwnerSplit — Κατανομή σε συνιδιοκτήτες + διαχειριστική αμοιβή (P2, persona
// «διαχειριστής ακινήτων»). Διάλεξε ακίνητο + περίοδο, όρισε ιδιοκτήτες/ποσοστά
// και αμοιβή διαχείρισης· βλέπεις το καθαρό κάθε ιδιοκτήτη (μετά έξοδα & αμοιβή)
// και εξάγεις επίσημη, επαληθεύσιμη «Κατάσταση κατανομής» (true-PDF).
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { T, TT, Btn, Badge } from '@/components/Theme';
import { computeSplit, type OwnerShare } from '@/lib/accounting/ownerSplit';
import { issueDocument } from '@/lib/documents/issue';
import { generateReportPdf, pEur, pSigned, pPct, type PdfReportModel } from '@/lib/pdf/pdfReport';
import type { ReportBranding } from '@/lib/reportBranding';

interface Prop { id: string; name: string; address: string | null }
const MONTHS = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const LS = (pid: string) => `po_owner_split_${pid}`;

interface Row { name: string; pct: string; afm: string }

export default function OwnerSplit({ open, onClose, userId, supabase, branding }: {
  open: boolean; onClose: () => void; userId: string; supabase: SupabaseClient; branding?: ReportBranding | null;
}) {
  const nowYear = new Date().getFullYear();
  const [props, setProps] = useState<Prop[]>([]);
  const [propId, setPropId] = useState('');
  const [year, setYear] = useState(nowYear);
  const [month, setMonth] = useState(0);
  const [rows, setRows] = useState<Row[]>([{ name: '', pct: '', afm: '' }]);
  const [feePct, setFeePct] = useState('');
  const [managerName, setManagerName] = useState('');
  const [figures, setFigures] = useState<{ gross: number; expenses: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase.from('user_properties').select('id,name,address').eq('user_id', userId).order('name')
      .then(({ data }) => { const ps = (data || []) as Prop[]; setProps(ps); setPropId(prev => prev || ps[0]?.id || ''); setLoading(false); });
  }, [open, userId, supabase]);

  // Φόρτωσε αποθηκευμένη διάταξη ιδιοκτητών ανά ακίνητο (localStorage).
  useEffect(() => {
    if (!propId) return;
    try {
      const saved = JSON.parse(localStorage.getItem(LS(propId)) || 'null');
      if (saved?.rows?.length) { setRows(saved.rows); setFeePct(saved.feePct || ''); setManagerName(saved.managerName || ''); }
      else { setRows([{ name: '', pct: '', afm: '' }]); setFeePct(''); setManagerName(''); }
    } catch { /* ignore */ }
  }, [propId]);

  // Άντληση εσόδων/εξόδων περιόδου για το ακίνητο.
  useEffect(() => {
    if (!open || !propId) { setFigures(null); return; }
    (async () => {
      const from = `${year}-${String(month || 1).padStart(2, '0')}-01`;
      const to = month > 0 ? `${year}-${String(month).padStart(2, '0')}-31` : `${year}-12-31`;
      let rentQ = supabase.from('rent_payments').select('amount,paid,period_year,period_month').eq('property_id', propId).eq('paid', true).eq('period_year', year);
      if (month > 0) rentQ = rentQ.eq('period_month', month);
      const [{ data: r }, { data: e }] = await Promise.all([
        rentQ,
        supabase.from('expenses').select('amount,date').eq('property_id', propId).gte('date', from).lte('date', to),
      ]);
      setFigures({ gross: (r || []).reduce((s: number, x: any) => s + num(x.amount), 0), expenses: (e || []).reduce((s: number, x: any) => s + num(x.amount), 0) });
    })();
  }, [open, propId, year, month, supabase]);

  const owners: OwnerShare[] = useMemo(() => rows.filter(r => r.name.trim()).map(r => ({ name: r.name.trim(), pct: num(r.pct), afm: r.afm.trim() || undefined })), [rows]);
  const result = useMemo(() => computeSplit({ grossIncome: figures?.gross || 0, expenses: figures?.expenses || 0, owners, managementFeePct: num(feePct), managerName }), [figures, owners, feePct, managerName]);
  const prop = props.find(p => p.id === propId);
  const periodLabel = month === 0 ? `Έτος ${year}` : `${MONTHS[month - 1]} ${year}`;

  const saveLayout = () => { try { localStorage.setItem(LS(propId), JSON.stringify({ rows, feePct, managerName })); } catch { /* ignore */ } };

  if (!open) return null;

  const setRow = (i: number, k: keyof Row, v: string) => setRows(rs => rs.map((r, j) => j === i ? { ...r, [k]: v } : r));
  const addRow = () => setRows(rs => [...rs, { name: '', pct: '', afm: '' }]);
  const delRow = (i: number) => setRows(rs => rs.filter((_, j) => j !== i));

  const exportPdf = async () => {
    setErr('');
    if (!prop) { setErr('Διάλεξε ακίνητο.'); return; }
    if (!result.valid) { setErr(result.warning || 'Έλεγξε τα ποσοστά.'); return; }
    setBusy(true);
    try {
      saveLayout();
      const issued = await issueDocument(supabase, {
        userId, docType: 'Κατάσταση κατανομής', subject: prop.name, period: periodLabel,
        summary: { gross: result.gross, expenses: result.expenses, fee: result.managementFee, distributable: result.distributable, owners: result.owners.length },
      });
      const model: PdfReportModel = {
        branding: branding ?? null, docType: 'Κατάσταση κατανομής',
        title: prop.name, subtitle: [periodLabel, prop.address].filter(Boolean).join(' · '),
        meta: { id: issued.id, issuedAt: issued.issuedAt, verifyUrl: issued.verifyUrl, note: periodLabel },
        sections: [
          { type: 'kpis', title: 'Σύνοψη περιόδου', items: [
            { label: 'Εισπράχθηκαν', value: pEur(result.gross) },
            { label: 'Έξοδα', value: pEur(result.expenses) },
            { label: result.managerName ? `Αμοιβή (${result.managerName})` : 'Αμοιβή διαχείρισης', value: pEur(result.managementFee) },
            { label: 'Προς διανομή', value: pSigned(result.distributable) },
          ] },
          { type: 'table', title: 'Κατανομή ανά ιδιοκτήτη', head: ['Ιδιοκτήτης', 'Ποσοστό', 'Έσοδα', 'Έξοδα', 'Αμοιβή', 'Καθαρό'], align: ['l', 'r', 'r', 'r', 'r', 'r'],
            rows: result.owners.map(o => [o.name + (o.afm ? ` (ΑΦΜ ${o.afm})` : ''), pPct(o.pct), pEur(o.incomeShare), pEur(o.expenseShare), pEur(o.feeShare), pSigned(o.net)]),
            result: ['Σύνολο', pPct(result.pctSum), pEur(result.gross), pEur(result.expenses), pEur(result.managementFee), pSigned(result.distributable)] },
        ],
        disclaimer: 'Κατανομή εσόδων/εξόδων περιόδου βάσει των δηλωμένων ποσοστών ιδιοκτησίας και της συμφωνηθείσας διαχειριστικής αμοιβής.',
      };
      await generateReportPdf(model, `Κατανομή_${prop.name}_${periodLabel}`.replace(/\s+/g, '_'));
      onClose();
    } catch (e: any) { setErr(e?.message || 'Αποτυχία δημιουργίας.'); }
    finally { setBusy(false); }
  };

  const field: React.CSSProperties = { height: 38, padding: '0 12px', borderRadius: T.radius.inner, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 14, fontFamily: T.font.sans, outline: 'none', boxSizing: 'border-box' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 18, width: 'min(760px, 100%)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: 'var(--elev-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 24px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...TT.h2 }}>Κατανομή σε ιδιοκτήτες</div>
            <div style={{ ...TT.bodySm, marginTop: 1 }}>Συνιδιοκτησία + διαχειριστική αμοιβή → καθαρό ανά ιδιοκτήτη</div>
          </div>
          <button onClick={onClose} aria-label="Κλείσιμο" style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: 4 }}>×</button>
        </div>

        <div style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {loading ? <div style={{ ...TT.bodySm }}>Φόρτωση…</div> : props.length === 0 ? <div style={{ ...TT.bodySm }}>Δεν υπάρχουν ακίνητα.</div> : (
            <>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <select value={propId} onChange={e => setPropId(e.target.value)} style={{ ...field, flex: '2 1 200px' }}>{props.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ ...field, flex: '1 1 90px' }}>{Array.from({ length: 7 }, (_, i) => nowYear - i).map(y => <option key={y} value={y}>{y}</option>)}</select>
                <select value={month} onChange={e => setMonth(Number(e.target.value))} style={{ ...field, flex: '1 1 130px' }}><option value={0}>Όλο το έτος</option>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
              </div>

              {/* Ιδιοκτήτες */}
              <div>
                <div style={{ ...TT.label, marginBottom: 8 }}>Ιδιοκτήτες & ποσοστά</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {rows.map((r, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input value={r.name} onChange={e => setRow(i, 'name', e.target.value)} placeholder="Όνομα" style={{ ...field, flex: '2 1 140px' }} />
                      <input value={r.afm} onChange={e => setRow(i, 'afm', e.target.value)} placeholder="ΑΦΜ" style={{ ...field, flex: '1 1 100px' }} inputMode="numeric" />
                      <div style={{ position: 'relative', flex: '0 0 92px' }}>
                        <input value={r.pct} onChange={e => setRow(i, 'pct', e.target.value)} placeholder="%" style={{ ...field, width: '100%', paddingRight: 26 }} inputMode="decimal" />
                        <span style={{ position: 'absolute', right: 10, top: 9, color: 'var(--text-tertiary)', fontSize: 13 }}>%</span>
                      </div>
                      <button onClick={() => delRow(i)} disabled={rows.length === 1} title="Αφαίρεση" style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: rows.length === 1 ? 'default' : 'pointer', fontSize: 18, lineHeight: 1, padding: 4, opacity: rows.length === 1 ? 0.3 : 1 }}>×</button>
                    </div>
                  ))}
                </div>
                <button onClick={addRow} style={{ ...TT.caption, marginTop: 8, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontWeight: 700 }}>+ Προσθήκη ιδιοκτήτη</button>
              </div>

              {/* Αμοιβή διαχείρισης */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: '1 1 160px' }}>
                  <div style={{ ...TT.label, marginBottom: 6 }}>Αμοιβή διαχείρισης</div>
                  <div style={{ position: 'relative' }}>
                    <input value={feePct} onChange={e => setFeePct(e.target.value)} placeholder="0" style={{ ...field, width: '100%', paddingRight: 60 }} inputMode="decimal" />
                    <span style={{ position: 'absolute', right: 10, top: 9, color: 'var(--text-tertiary)', fontSize: 12 }}>% εσόδων</span>
                  </div>
                </div>
                <div style={{ flex: '2 1 200px' }}>
                  <div style={{ ...TT.label, marginBottom: 6 }}>Διαχειριστής (προαιρετικό)</div>
                  <input value={managerName} onChange={e => setManagerName(e.target.value)} placeholder="Επωνυμία διαχειριστή" style={{ ...field, width: '100%' }} />
                </div>
              </div>

              {/* Αποτέλεσμα */}
              {figures && (
                <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: '10px 14px', background: 'var(--bg-elevated)', fontSize: 12 }}>
                    <span>Εισπράχθηκαν <b>{pEur(result.gross)}</b></span>
                    <span>Έξοδα <b>{pEur(result.expenses)}</b></span>
                    <span>Αμοιβή <b>{pEur(result.managementFee)}</b></span>
                    <span>Προς διανομή <b>{pEur(result.distributable)}</b></span>
                    <span style={{ marginLeft: 'auto' }}><Badge tone={result.valid ? 'positive' : 'warning'}>{result.valid ? `${result.pctSum}% ✓` : `${result.pctSum}%`}</Badge></span>
                  </div>
                  {result.owners.map((o, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, padding: '9px 14px', borderTop: '1px solid var(--border-subtle)', fontSize: 13, alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name}<span style={{ color: 'var(--text-tertiary)', marginLeft: 8, fontSize: 11 }}>{pPct(o.pct)}</span></span>
                      <span style={{ color: 'var(--text-tertiary)', fontSize: 11, fontFamily: T.font.mono }}>−{pEur(o.expenseShare + o.feeShare)}</span>
                      <span style={{ fontFamily: T.font.mono, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{pEur(o.net)}</span>
                    </div>
                  ))}
                </div>
              )}

              {err && <div style={{ fontSize: 12.5, color: 'var(--negative)', background: 'var(--negative-soft)', border: '1px solid var(--negative-border)', borderRadius: 10, padding: '10px 14px' }}>{err}</div>}
            </>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 24px', borderTop: '1px solid var(--border-subtle)', flexShrink: 0, flexWrap: 'wrap' }}>
          <span style={{ ...TT.bodySm }}>{prop?.name || '—'} · {periodLabel}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="secondary" onClick={() => { saveLayout(); onClose(); }}>Αποθήκευση & κλείσιμο</Btn>
            <Btn variant="primary" onClick={exportPdf} disabled={busy || !result.valid}>{busy ? 'Δημιουργία…' : 'Κατάσταση κατανομής (PDF)'}</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
