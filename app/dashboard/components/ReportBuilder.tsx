'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ReportBuilder — ελαφρύς δημιουργός αναφορών: διάλεξε περίοδο + ακίνητα +
// ενότητες και πάρε ένα επίσημο, επαληθεύσιμο true-PDF (μέσω lib/pdf/pdfReport,
// με αρ. εγγράφου + QR). Αποθηκευμένα προφίλ (presets) στο localStorage ώστε η
// ίδια αναφορά να ξαναβγαίνει με ένα κλικ κάθε μήνα/χρόνο.
//
// Τα δεδομένα αντλούνται μόνα τους (user_properties / rent_payments / expenses)
// με βάση τα επιλεγμένα ακίνητα και την περίοδο· καμία εξάρτηση από MCP.
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { T, TT, Btn, Badge } from '@/components/Theme';
import PropertyPicker from './PropertyPicker';
import { CustomSelect as Select } from './UIComponents';
import { num } from './docUtils';
import { issueDocument } from '@/lib/documents/issue';
import { generateReportPdf, pEur, pSigned, type PdfReportModel, type PdfSection } from '@/lib/pdf/pdfReport';
import { downloadPortfolioComparison, type PortfolioRow } from './portfolioXlsx';
import type { ReportBranding } from '@/lib/reportBranding';
import { MONTHS_NOM } from '@/lib/core/months';

interface Prop { id: string; name: string; address: string | null }
interface RentRow { property_id: string | null; period_year: number | null; period_month: number | null; amount: number | null; paid: boolean | null }
interface ExpRow { property_id: string | null; date: string | null; amount: number | null; category: string | null }

const SECTIONS = [
  { key: 'summary', label: 'Σύνοψη (δείκτες)', hint: 'Έσοδα, εισπράξεις, δαπάνες, καθαρό' },
  { key: 'byProperty', label: 'Ανά ακίνητο', hint: 'Εισπράξεις / δαπάνες / καθαρό ανά ακίνητο' },
  { key: 'charts', label: 'Γραφήματα (B&W)', hint: 'Εισπράξεις ανά μήνα & καθαρό ανά ακίνητο' },
  { key: 'rent', label: 'Συμφωνία ενοικίων', hint: 'Αναμενόμενα / εισπραχθέντα ανά μήνα' },
  { key: 'expenses', label: 'Δαπάνες ανά κατηγορία', hint: 'Σύνολα δαπανών ανά κατηγορία' },
] as const;
type SectionKey = typeof SECTIONS[number]['key'];

const PRESET_KEY = 'po_report_presets_v1';
interface Preset { name: string; month: number; sections: SectionKey[]; propIds: string[] }


export default function ReportBuilder({ open, onClose, userId, supabase, branding }: {
  open: boolean; onClose: () => void; userId: string; supabase: SupabaseClient; branding?: ReportBranding | null;
}) {
  const nowYear = new Date().getFullYear();
  const [props, setProps] = useState<Prop[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(nowYear);
  const [month, setMonth] = useState(0);                 // 0 = όλο το έτος
  const [propIds, setPropIds] = useState<Set<string>>(new Set());
  const [sections, setSections] = useState<Set<SectionKey>>(new Set(['summary', 'byProperty', 'charts', 'rent', 'expenses']));
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetName, setPresetName] = useState('');
  const [busy, setBusy] = useState(false);
  const [xlsxBusy, setXlsxBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    try { setPresets(JSON.parse(localStorage.getItem(PRESET_KEY) || '[]')); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase.from('user_properties').select('id,name,address').eq('user_id', userId).order('name')
      .then(({ data }) => {
        const ps = (data || []) as Prop[];
        setProps(ps);
        setPropIds(prev => prev.size ? prev : new Set(ps.map(p => p.id)));
        setLoading(false);
      });
  }, [open, userId, supabase]);

  const savePresets = (list: Preset[]) => { setPresets(list); try { localStorage.setItem(PRESET_KEY, JSON.stringify(list)); } catch { /* ignore */ } };
  const addPreset = () => {
    const name = presetName.trim(); if (!name) return;
    const p: Preset = { name, month, sections: [...sections], propIds: [...propIds] };
    savePresets([...presets.filter(x => x.name !== name), p]); setPresetName('');
  };
  const applyPreset = (p: Preset) => {
    setMonth(p.month); setSections(new Set(p.sections));
    setPropIds(new Set(p.propIds.filter(id => props.some(pr => pr.id === id))));
  };

  const yearsAvail = useMemo(() => Array.from({ length: 7 }, (_, i) => nowYear - i), [nowYear]);
  const selProps = useMemo(() => props.filter(p => propIds.has(p.id)), [props, propIds]);

  const toggle = <X,>(set: Set<X>, v: X, setter: (s: Set<X>) => void) => { const n = new Set(set); n.has(v) ? n.delete(v) : n.add(v); setter(n); };

  if (!open) return null;

  const periodLabel = month === 0 ? `Έτος ${year}` : `${MONTHS_NOM[month - 1]} ${year}`;

  const generate = async () => {
    setErr('');
    if (!selProps.length) { setErr('Διάλεξε τουλάχιστον ένα ακίνητο.'); return; }
    if (!sections.size) { setErr('Διάλεξε τουλάχιστον μία ενότητα.'); return; }
    setBusy(true);
    try {
      const ids = selProps.map(p => p.id);
      const nameById = new Map(selProps.map(p => [p.id, p.name]));

      // ── Άντληση δεδομένων περιόδου (RLS: μόνο του χρήστη) ──────────────────
      let rentQ = supabase.from('rent_payments').select('property_id,period_year,period_month,amount,paid').in('property_id', ids).eq('period_year', year);
      if (month > 0) rentQ = rentQ.eq('period_month', month);
      const from = `${year}-${String(month || 1).padStart(2, '0')}-01`;
      const to = month > 0 ? `${year}-${String(month).padStart(2, '0')}-31` : `${year}-12-31`;
      const [{ data: rentData }, { data: expData }] = await Promise.all([
        rentQ,
        supabase.from('expenses').select('property_id,date,amount,category').in('property_id', ids).gte('date', from).lte('date', to),
      ]);
      const rents = (rentData || []) as RentRow[];
      const exps = (expData || []) as ExpRow[];

      // ── Συγκεντρωτικά ─────────────────────────────────────────────────────
      const expected = rents.reduce((s, r) => s + num(r.amount), 0);
      const collected = rents.reduce((s, r) => s + (r.paid ? num(r.amount) : 0), 0);
      const outstanding = Math.max(0, expected - collected);
      const expTotal = exps.reduce((s, e) => s + num(e.amount), 0);
      const net = collected - expTotal;

      const built: PdfSection[] = [];

      if (sections.has('summary')) {
        built.push({ type: 'kpis', title: 'Σύνοψη', items: [
          { label: 'Αναμενόμενα ενοίκια', value: pEur(expected) },
          { label: 'Εισπράχθηκαν', value: pEur(collected) },
          { label: 'Δαπάνες', value: pEur(expTotal) },
          { label: 'Καθαρό αποτέλεσμα', value: pSigned(net) },
        ] });
      }

      if (sections.has('charts')) {
        // Εισπράξεις ανά μήνα (μόνο σε πλήρες έτος) — ασπρόμαυρες ράβδοι.
        if (month === 0) {
          const monthly = Array.from({ length: 12 }, (_, m) => ({
            label: MONTHS_NOM[m].slice(0, 3),
            value: rents.filter(r => r.period_month === m + 1).reduce((s, r) => s + (r.paid ? num(r.amount) : 0), 0),
          }));
          if (monthly.some(d => d.value > 0)) built.push({ type: 'chart', title: 'Εισπράξεις ανά μήνα', chart: 'bars', data: monthly, unit: 'eur' });
        }
        // Καθαρό ανά ακίνητο (όταν >1 ακίνητο).
        if (selProps.length > 1) {
          const perProp = selProps.map(p => {
            const c = rents.filter(r => r.property_id === p.id).reduce((s, r) => s + (r.paid ? num(r.amount) : 0), 0);
            const e = exps.filter(x => x.property_id === p.id).reduce((s, x) => s + num(x.amount), 0);
            return { label: p.name.length > 10 ? p.name.slice(0, 9) + '…' : p.name, value: c - e };
          });
          built.push({ type: 'chart', title: 'Καθαρό ανά ακίνητο', chart: 'bars', data: perProp, unit: 'eur' });
        }
      }

      if (sections.has('byProperty')) {
        const rows = selProps.map(p => {
          const c = rents.filter(r => r.property_id === p.id).reduce((s, r) => s + (r.paid ? num(r.amount) : 0), 0);
          const e = exps.filter(x => x.property_id === p.id).reduce((s, x) => s + num(x.amount), 0);
          return [p.name, pEur(c), pEur(e), pSigned(c - e)];
        });
        built.push({ type: 'table', title: 'Ανά ακίνητο', head: ['Ακίνητο', 'Εισπράχθηκαν', 'Δαπάνες', 'Καθαρό'], align: ['l', 'r', 'r', 'r'],
          rows, result: ['Σύνολο', pEur(collected), pEur(expTotal), pSigned(net)] });
      }

      if (sections.has('rent')) {
        // Ανά μήνα (ή μία γραμμή αν επιλεγμένος μήνας).
        const months = month > 0 ? [month] : Array.from({ length: 12 }, (_, i) => i + 1);
        const rows = months.map(m => {
          const mr = rents.filter(r => r.period_month === m);
          const exp = mr.reduce((s, r) => s + num(r.amount), 0);
          const col = mr.reduce((s, r) => s + (r.paid ? num(r.amount) : 0), 0);
          const status = exp === 0 ? '—' : col >= exp ? 'Πλήρης' : col > 0 ? 'Μερική' : 'Εκκρεμεί';
          return [MONTHS_NOM[m - 1], `${pEur(col)} / ${pEur(exp)}`, status];
        }).filter(r => r[1] !== `${pEur(0)} / ${pEur(0)}`);
        built.push({ type: 'table', title: 'Συμφωνία ενοικίων', head: ['Περίοδος', 'Εισπράχθηκε / Αναμενόμενο', 'Κατάσταση'], align: ['l', 'r', 'r'],
          rows: rows.length ? rows : [['—', `${pEur(0)} / ${pEur(0)}`, '—']],
          result: ['Σύνολο', `${pEur(collected)} / ${pEur(expected)}`, outstanding > 0 ? `Ανείσπρακτα ${pEur(outstanding)}` : 'Πλήρης'] });
      }

      if (sections.has('expenses')) {
        const byCat = new Map<string, number>();
        for (const e of exps) { const k = e.category || 'Λοιπά'; byCat.set(k, (byCat.get(k) || 0) + num(e.amount)); }
        const rows = [...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, pEur(v)]);
        built.push({ type: 'table', title: 'Δαπάνες ανά κατηγορία', head: ['Κατηγορία', 'Ποσό'], align: ['l', 'r'],
          rows: rows.length ? rows : [['—', pEur(0)]], result: ['Σύνολο', pEur(expTotal)] });
      }

      const subject = selProps.length === 1 ? selProps[0].name : `${selProps.length} ακίνητα`;
      const issued = await issueDocument(supabase, {
        userId, docType: 'Αναφορά χαρτοφυλακίου', subject, period: periodLabel,
        summary: { properties: selProps.length, expected, collected, expenses: expTotal, net },
      });

      const model: PdfReportModel = {
        branding: branding ?? null, docType: 'Αναφορά χαρτοφυλακίου',
        title: selProps.length === 1 ? selProps[0].name : 'Αναφορά χαρτοφυλακίου',
        subtitle: [periodLabel, selProps.length > 1 ? `${selProps.length} ακίνητα` : selProps[0].address].filter(Boolean).join(' · '),
        meta: { id: issued.id, issuedAt: issued.issuedAt, verifyUrl: issued.verifyUrl, note: periodLabel },
        sections: built,
        disclaimer: 'Ενημερωτικό έγγραφο από τα καταχωρημένα στοιχεία εσόδων και δαπανών της περιόδου.',
      };
      await generateReportPdf(model, `Αναφορά_${subject}_${periodLabel}`.replace(/\s+/g, '_'));
      onClose();
    } catch (e: any) {
      setErr(e?.message || 'Αποτυχία δημιουργίας αναφοράς.');
    } finally { setBusy(false); }
  };

  // ── Συγκριτικό Excel χαρτοφυλακίου ──────────────────────────────────────────
  // Παραθέτει τα επιλεγμένα ακίνητα δίπλα-δίπλα (αναμενόμενα, εισπράξεις,
  // ανείσπρακτα, δαπάνες, καθαρό, ποσοστό είσπραξης) με ζωντανά σύνολα.
  const generateComparison = async () => {
    setErr('');
    if (selProps.length < 2) { setErr('Το συγκριτικό Excel χρειάζεται τουλάχιστον δύο ακίνητα.'); return; }
    setXlsxBusy(true);
    try {
      const ids = selProps.map(p => p.id);
      let rentQ = supabase.from('rent_payments').select('property_id,period_year,period_month,amount,paid').in('property_id', ids).eq('period_year', year);
      if (month > 0) rentQ = rentQ.eq('period_month', month);
      const from = `${year}-${String(month || 1).padStart(2, '0')}-01`;
      const to = month > 0 ? `${year}-${String(month).padStart(2, '0')}-31` : `${year}-12-31`;
      const [{ data: rentData }, { data: expData }] = await Promise.all([
        rentQ,
        supabase.from('expenses').select('property_id,date,amount,category').in('property_id', ids).gte('date', from).lte('date', to),
      ]);
      const rents = (rentData || []) as RentRow[];
      const exps = (expData || []) as ExpRow[];
      const rows: PortfolioRow[] = selProps.map(p => ({
        name: p.name,
        expected: rents.filter(r => r.property_id === p.id).reduce((s, r) => s + num(r.amount), 0),
        collected: rents.filter(r => r.property_id === p.id).reduce((s, r) => s + (r.paid ? num(r.amount) : 0), 0),
        expenses: exps.filter(x => x.property_id === p.id).reduce((s, x) => s + num(x.amount), 0),
      }));
      downloadPortfolioComparison({ rows, periodLabel });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Αποτυχία δημιουργίας Excel.');
    } finally { setXlsxBusy(false); }
  };

  // ── Στυλ (ίδια premium γλώσσα με το Λογιστικό ημερολόγιο) ────────────────────
  const field: React.CSSProperties = {
    height: 38, padding: '0 13px', borderRadius: 8, border: '1px solid var(--border-default)',
    background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 500, fontFamily: T.font.sans, outline: 'none', boxSizing: 'border-box', cursor: 'pointer',
  };
  // Ουδέτερη επιλογή: η κάρτα μένει ήρεμη· μόνο το κουτάκι ελέγχου παίρνει accent.
  const pill = (on: boolean): React.CSSProperties => ({
    fontSize: 12, fontWeight: 600, padding: '9px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
    border: `1px solid ${on ? 'var(--border-default)' : 'var(--border-subtle)'}`,
    background: 'var(--bg-surface)', color: on ? 'var(--text-primary)' : 'var(--text-secondary)', fontFamily: T.font.sans,
    transition: 'border-color 0.15s, background 0.15s',
  });

  return (
    <div role="dialog" aria-modal="true" aria-label="Δημιουργία αναφοράς" onClick={onClose} style={{ position: 'fixed', inset: 0, background: T.scrim, backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 18, width: 'min(720px, 100%)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: 'var(--elev-3)' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 24px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...TT.h2 }}>Δημιουργία αναφοράς</div>
            <div style={{ ...TT.bodySm, marginTop: 1 }}>Περίοδος, ακίνητα και ενότητες σε επίσημο, επαληθεύσιμο PDF</div>
          </div>
          <button onClick={onClose} aria-label="Κλείσιμο" style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: 4 }}>×</button>
        </div>

        <div style={{ padding: '18px 24px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 15 }}>
          {presets.length > 0 && (
            <div>
              <div style={{ ...TT.label, marginBottom: 8 }}>ΑΠΟΘΗΚΕΥΜΕΝΑ ΠΡΟΦΙΛ</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {presets.map(p => (
                  <span key={p.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--border-default)', borderRadius: T.radius.pill, padding: '4px 6px 4px 12px' }}>
                    <button onClick={() => applyPreset(p)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>{p.name}</button>
                    <button onClick={() => savePresets(presets.filter(x => x.name !== p.name))} title="Διαγραφή" style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: '0 2px' }}>×</button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Περίοδος */}
          <div>
            <div style={{ ...TT.label, marginBottom: 8 }}>ΠΕΡΙΟΔΟΣ</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: '0 1 130px', minWidth: 110 }}>
                <Select value={String(year)} onChange={v => setYear(Number(v))} options={yearsAvail.map(y => ({ value: String(y), label: String(y) }))} />
              </div>
              <div style={{ flex: '0 1 170px', minWidth: 150 }}>
                <Select value={String(month)} onChange={v => setMonth(Number(v))} options={[{ value: '0', label: 'Όλο το έτος' }, ...MONTHS_NOM.map((m, i) => ({ value: String(i + 1), label: m }))]} />
              </div>
            </div>
          </div>

          {/* Ακίνητα */}
          <div>
            <div style={{ ...TT.label, marginBottom: 8 }}>ΑΚΙΝΗΤΑ</div>
            <PropertyPicker items={props} selected={propIds} onChange={setPropIds} loading={loading} />
          </div>

          {/* Ενότητες */}
          <div>
            <div style={{ ...TT.label, marginBottom: 8 }}>ΕΝΟΤΗΤΕΣ</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))', gap: 8 }}>
              {SECTIONS.map(s => {
                const on = sections.has(s.key);
                return (
                  <button key={s.key} onClick={() => toggle(sections, s.key, setSections)} style={{ ...pill(on), display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ width: 16, height: 16, marginTop: 1, borderRadius: 6, flexShrink: 0, border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border-default)'}`, background: on ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {on && <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>}
                    </span>
                    <span>
                      <span style={{ display: 'block', fontWeight: 660, letterSpacing: '-0.01em' }}>{s.label}</span>
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3, fontWeight: 400, lineHeight: 1.4 }}>{s.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Αποθήκευση προφίλ */}
          <div>
            <div style={{ ...TT.label, marginBottom: 8 }}>ΑΠΟΘΗΚΕΥΣΗ ΩΣ ΠΡΟΦΙΛ (ΠΡΟΑΙΡΕΤΙΚΟ)</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={presetName} onChange={e => setPresetName(e.target.value)} placeholder="Παράδειγμα: Μηνιαία σύνοψη" style={{ ...field, flex: 1 }} />
              <Btn variant="secondary" onClick={addPreset} disabled={!presetName.trim()}>Αποθήκευση</Btn>
            </div>
          </div>

          {err && <div style={{ fontSize: 12.5, color: 'var(--negative)', background: 'var(--negative-soft)', border: '1px solid var(--negative-border)', borderRadius: 10, padding: '10px 14px' }}>{err}</div>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 24px', borderTop: '1px solid var(--border-subtle)', flexShrink: 0, flexWrap: 'wrap' }}>
          <span style={{ ...TT.bodySm, display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{selProps.length} {selProps.length === 1 ? 'ακίνητο' : 'ακίνητα'} · {periodLabel} <Badge tone="neutral">Επαληθεύσιμο PDF</Badge></span>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="secondary" onClick={onClose}>Άκυρο</Btn>
            {selProps.length > 1 && (
              <Btn variant="secondary" onClick={generateComparison} disabled={busy || xlsxBusy}>{xlsxBusy ? 'Excel…' : 'Συγκριτικό Excel'}</Btn>
            )}
            <Btn variant="primary" onClick={generate} disabled={busy || xlsxBusy || !selProps.length || !sections.size}>{busy ? 'Δημιουργία…' : 'Δημιουργία PDF'}</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
