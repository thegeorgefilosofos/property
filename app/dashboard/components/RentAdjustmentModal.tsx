'use client';

// ═══════════════════════════════════════════════════════════════════════════
// RentAdjustmentModal — Ειδοποίηση αναπροσαρμογής μισθώματος με e-signature (P3.2).
// Επιλογή ακινήτου/μισθωτή, τρέχον μίσθωμα, μέθοδος (ποσοστό/ΔΤΚ/χειροκίνητο),
// ημερομηνία ισχύος, ηλεκτρονική υπογραφή εκμισθωτή → επίσημο, επαληθεύσιμο
// true-PDF με ενσωματωμένη υπογραφή (lib/pdf/pdfReport section 'sign').
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { T, TT, Btn } from '@/components/Theme';
import SignaturePad from '@/components/SignaturePad';
import { computeRentAdjustment, adjustmentNoticeText, type AdjMethod } from '@/lib/documents/rentAdjustment';
import { issueDocument } from '@/lib/documents/issue';
import { generateReportPdf, pEur, pPct, type PdfReportModel } from '@/lib/pdf/pdfReport';
import type { ReportBranding } from '@/lib/reportBranding';

interface Prop { id: string; name: string; address: string | null }
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const grDate = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? iso : d.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
const todayIso = () => new Date().toISOString().slice(0, 10);

export default function RentAdjustmentModal({ open, onClose, userId, supabase, branding }: {
  open: boolean; onClose: () => void; userId: string; supabase: SupabaseClient; branding?: ReportBranding | null;
}) {
  const [props, setProps] = useState<Prop[]>([]);
  const [propId, setPropId] = useState('');
  const [tenant, setTenant] = useState('');
  const [currentRent, setCurrentRent] = useState('');
  const [method, setMethod] = useState<AdjMethod>('percent');
  const [percent, setPercent] = useState('');
  const [newRentManual, setNewRentManual] = useState('');
  const [effective, setEffective] = useState(todayIso());
  const [ownerName, setOwnerName] = useState('');
  const [place, setPlace] = useState('');
  const [sig, setSig] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase.from('user_properties').select('id,name,address').eq('user_id', userId).order('name')
      .then(({ data }) => { const ps = (data || []) as Prop[]; setProps(ps); setPropId(prev => prev || ps[0]?.id || ''); setLoading(false); });
    if (branding?.companyName && !ownerName) setOwnerName(branding.companyName);
  }, [open, userId, supabase]);

  // Prefill μισθωτή + τρέχοντος μισθώματος από τα δεδομένα του ακινήτου.
  useEffect(() => {
    if (!open || !propId) return;
    (async () => {
      const [{ data: t }, { data: r }] = await Promise.all([
        supabase.from('tenants').select('full_name').eq('property_id', propId).eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('rent_payments').select('amount').eq('property_id', propId).order('period_year', { ascending: false }).order('period_month', { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (t?.full_name) setTenant(t.full_name);
      if (r?.amount) setCurrentRent(String(r.amount));
    })();
  }, [open, propId, userId, supabase]);

  const prop = props.find(p => p.id === propId);
  const res = useMemo(() => computeRentAdjustment({ currentRent: num(currentRent), method, percent: num(percent), cpiPct: num(percent), newRentManual: num(newRentManual) }), [currentRent, method, percent, newRentManual]);

  if (!open) return null;

  const generate = async () => {
    setErr('');
    if (!prop) { setErr('Διάλεξε ακίνητο.'); return; }
    if (num(currentRent) <= 0) { setErr('Συμπλήρωσε το τρέχον μίσθωμα.'); return; }
    if (!sig) { setErr('Υπόγραψε το έγγραφο.'); return; }
    setBusy(true);
    try {
      const notice = adjustmentNoticeText({ tenantName: tenant.trim() || undefined, address: prop.address || undefined, effectiveDate: grDate(effective), method, res });
      const issued = await issueDocument(supabase, {
        userId, docType: 'Ειδοποίηση αναπροσαρμογής μισθώματος', subject: [prop.name, tenant.trim()].filter(Boolean).join(' · '),
        period: `Ισχύς από ${grDate(effective)}`, summary: { currentRent: res.currentRent, newRent: res.newRent, pct: res.pctApplied },
      });
      const model: PdfReportModel = {
        branding: branding ?? null, docType: 'Ειδοποίηση αναπροσαρμογής μισθώματος',
        title: 'Ειδοποίηση αναπροσαρμογής μισθώματος',
        subtitle: [prop.name, prop.address].filter(Boolean).join(' · '),
        meta: { id: issued.id, issuedAt: issued.issuedAt, verifyUrl: issued.verifyUrl, asOfLabel: 'Ημερομηνία', note: `Ισχύς από ${grDate(effective)}` },
        sections: [
          { type: 'note', text: notice },
          { type: 'rows', title: 'Στοιχεία αναπροσαρμογής', rows: [
            { label: 'Τρέχον μηνιαίο μίσθωμα', value: pEur(res.currentRent) },
            { label: 'Μεταβολή', value: pPct(res.pctApplied) },
            { label: 'Νέο μηνιαίο μίσθωμα', value: pEur(res.newRent), kind: 'result' },
            { label: 'Ισχύς από', value: grDate(effective) },
          ] },
          { type: 'sign', signers: [{ role: 'Ο/Η εκμισθωτής', name: ownerName.trim() || undefined, image: sig, place: place.trim() || undefined, date: grDate(todayIso()) }] },
        ],
        disclaimer: 'Έγγραφη ειδοποίηση αναπροσαρμογής μισθώματος. Επιβεβαιώστε τους όρους με το μισθωτήριο και τον νομικό/λογιστικό σας σύμβουλο.',
      };
      await generateReportPdf(model, `Αναπροσαρμογή_${prop.name}_${grDate(effective)}`.replace(/[\/\s]+/g, '_'));
      onClose();
    } catch (e: any) { setErr(e?.message || 'Αποτυχία δημιουργίας.'); }
    finally { setBusy(false); }
  };

  const field: React.CSSProperties = { height: 38, padding: '0 12px', borderRadius: T.radius.inner, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 14, fontFamily: T.font.sans, outline: 'none', boxSizing: 'border-box', width: '100%' };
  const lbl = { ...TT.label, marginBottom: 6 } as React.CSSProperties;
  const seg = (m: AdjMethod, label: string): React.CSSProperties => ({ flex: 1, fontSize: 12, fontWeight: 600, padding: '8px 6px', borderRadius: T.radius.inner, cursor: 'pointer', textAlign: 'center', border: `1px solid ${method === m ? 'var(--accent-border)' : 'var(--border-default)'}`, background: method === m ? 'var(--accent-soft)' : 'transparent', color: method === m ? 'var(--accent)' : 'var(--text-secondary)', fontFamily: T.font.sans });

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 18, width: 'min(720px, 100%)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: 'var(--elev-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 24px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...TT.h2 }}>Ειδοποίηση αναπροσαρμογής</div>
            <div style={{ ...TT.bodySm, marginTop: 1 }}>Νομικό έγγραφο με ηλεκτρονική υπογραφή & QR επαλήθευσης</div>
          </div>
          <button onClick={onClose} aria-label="Κλείσιμο" style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: 4 }}>×</button>
        </div>

        <div style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loading ? <div style={{ ...TT.bodySm }}>Φόρτωση…</div> : props.length === 0 ? <div style={{ ...TT.bodySm }}>Δεν υπάρχουν ακίνητα.</div> : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12 }}>
                <div><div style={lbl}>Ακίνητο</div><select value={propId} onChange={e => setPropId(e.target.value)} style={field}>{props.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
                <div><div style={lbl}>Μισθωτής</div><input value={tenant} onChange={e => setTenant(e.target.value)} placeholder="Ονοματεπώνυμο" style={field} /></div>
              </div>

              <div>
                <div style={lbl}>Μέθοδος αναπροσαρμογής</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setMethod('percent')} style={seg('percent', '')}>Ποσοστό</button>
                  <button onClick={() => setMethod('cpi')} style={seg('cpi', '')}>ΔΤΚ (ΕΛΣΤΑΤ)</button>
                  <button onClick={() => setMethod('manual')} style={seg('manual', '')}>Χειροκίνητο</button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 12 }}>
                <div><div style={lbl}>Τρέχον μίσθωμα (€)</div><input value={currentRent} onChange={e => setCurrentRent(e.target.value)} inputMode="decimal" style={field} /></div>
                {method === 'manual'
                  ? <div><div style={lbl}>Νέο μίσθωμα (€)</div><input value={newRentManual} onChange={e => setNewRentManual(e.target.value)} inputMode="decimal" style={field} /></div>
                  : <div><div style={lbl}>{method === 'cpi' ? 'Μεταβολή ΔΤΚ (%)' : 'Ποσοστό (%)'}</div><input value={percent} onChange={e => setPercent(e.target.value)} inputMode="decimal" style={field} /></div>}
                <div><div style={lbl}>Ισχύς από</div><input type="date" value={effective} onChange={e => setEffective(e.target.value)} style={field} /></div>
              </div>

              {/* Live αποτέλεσμα */}
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: '12px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 12, fontSize: 13 }}>
                <span>Τρέχον <b>{pEur(res.currentRent)}</b></span>
                <span>Μεταβολή <b>{pPct(res.pctApplied)}</b></span>
                <span>Νέο <b style={{ color: 'var(--accent)' }}>{pEur(res.newRent)}</b></span>
                <span style={{ color: res.increase >= 0 ? 'var(--text-secondary)' : 'var(--negative)' }}>({res.increase >= 0 ? '+' : ''}{pEur(res.increase)})</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12 }}>
                <div><div style={lbl}>Εκμισθωτής (υπογράφων)</div><input value={ownerName} onChange={e => setOwnerName(e.target.value)} placeholder="Ονοματεπώνυμο / επωνυμία" style={field} /></div>
                <div><div style={lbl}>Τόπος</div><input value={place} onChange={e => setPlace(e.target.value)} placeholder="π.χ. Αθήνα" style={field} /></div>
              </div>

              <div>
                <div style={lbl}>Ηλεκτρονική υπογραφή</div>
                <SignaturePad onChange={setSig} />
              </div>

              {err && <div style={{ fontSize: 12.5, color: 'var(--negative)', background: 'var(--negative-soft)', border: '1px solid var(--negative-border)', borderRadius: 10, padding: '10px 14px' }}>{err}</div>}
            </>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '14px 24px', borderTop: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <Btn variant="secondary" onClick={onClose}>Άκυρο</Btn>
          <Btn variant="primary" onClick={generate} disabled={busy || !sig || num(currentRent) <= 0}>{busy ? 'Δημιουργία…' : 'Υπογεγραμμένο PDF'}</Btn>
        </div>
      </div>
    </div>
  );
}
