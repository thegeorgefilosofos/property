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
import { InfoHint } from './InfoHint';
import DateField from './DateField';
import Select from './Select';
import ScanButton from './ScanButton';
import SignaturePad from '@/components/SignaturePad';
import { computeRentAdjustment, adjustmentNoticeText, type AdjMethod } from '@/lib/documents/rentAdjustment';
import { issueDocument } from '@/lib/documents/issue';
import { generateReportPdf, reportPdfBlob, pEur, pPct, type PdfReportModel } from '@/lib/pdf/pdfReport';
import type { ReportBranding } from '@/lib/reportBranding';

interface Prop { id: string; name: string; address: string | null }
// Ελάχιστοι τύποι για την αναγνώριση ομιλίας του browser (δεν υπάρχουν στο lib.dom).
interface SpeechEvent { results?: { [i: number]: { [j: number]: { transcript?: string } } } }
interface SpeechRec { lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number; start(): void; onresult: (e: SpeechEvent) => void; onerror: () => void; onend: () => void }
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
  // Μετά τη δημιουργία: ερώτηση αρχειοθέτησης στα έγγραφα του ακινήτου.
  const [pending, setPending] = useState<{ model: PdfReportModel; fname: string } | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [archived, setArchived] = useState(false);
  const [listening, setListening] = useState(false);

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
      const fname = `Αναπροσαρμογή_${prop.name}_${grDate(effective)}`.replace(/[\/\s]+/g, '_');
      await generateReportPdf(model, fname);
      // Δεν κλείνουμε ακόμη: ρωτάμε αν θα αρχειοθετηθεί στα έγγραφα του ακινήτου.
      setPending({ model, fname });
    } catch (e: any) { setErr(e?.message || 'Αποτυχία δημιουργίας.'); }
    finally { setBusy(false); }
  };

  // Αρχειοθέτηση στα έγγραφα του ακινήτου, με ημερομηνία (χρονολογική σειρά).
  const archive = async () => {
    if (!pending || !prop) return;
    setArchiving(true); setErr('');
    try {
      const blob = await reportPdfBlob(pending.model);
      const path = `${userId}/${prop.id}/document/${Date.now()}_${pending.fname}.pdf`;
      const { error: upErr } = await supabase.storage.from('property-files').upload(path, blob, { upsert: false, contentType: 'application/pdf' });
      if (upErr) throw upErr;
      const base = {
        property_id: prop.id, user_id: userId, kind: 'document', category: 'lease',
        title: `Αναπροσαρμογή μισθώματος · ισχύς από ${grDate(effective)}`.slice(0, 200),
        notes: `Νέο μίσθωμα ${pEur(res.newRent)} (από ${pEur(res.currentRent)}, ${pPct(res.pctApplied)})`,
        doc_date: effective, file_path: path, file_name: `${pending.fname}.pdf`,
        mime: 'application/pdf', size_bytes: blob.size,
      };
      let { error } = await supabase.from('property_documents').insert({ ...base, supplier: tenant.trim() || null });
      if (error && /supplier/i.test(error.message)) ({ error } = await supabase.from('property_documents').insert(base));
      if (error) throw error;
      setArchived(true);
      setTimeout(onClose, 1200);
    } catch { setErr('Η αρχειοθέτηση απέτυχε. Το PDF έχει ήδη κατέβει.'); }
    finally { setArchiving(false); }
  };

  // Φωνητική απάντηση στην ερώτηση αρχειοθέτησης: «ναι» → αποθήκευση,
  // «όχι / αργότερα» → κλείσιμο. Χρησιμοποιεί την αναγνώριση ομιλίας του browser.
  const answerByVoice = () => {
    const SR = (globalThis as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec }).SpeechRecognition
      || (globalThis as unknown as { webkitSpeechRecognition?: new () => SpeechRec }).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = 'el-GR'; rec.interimResults = false; rec.continuous = false; rec.maxAlternatives = 1;
    rec.onresult = (e: SpeechEvent) => {
      const said = String(e.results?.[0]?.[0]?.transcript || '').toLowerCase();
      setListening(false);
      if (/(ναι|ναί|αποθήκευσ|σώσ|φύλαξ)/.test(said)) archive();
      else if (/(όχι|οχι|αργότερα|αργοτερα|ίσως|ισως|άκυρο)/.test(said)) onClose();
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    setListening(true);
    try { rec.start(); } catch { setListening(false); }
  };

  const field: React.CSSProperties = { height: 40, padding: '0 13px', borderRadius: T.radius.inner, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 14, fontFamily: T.font.sans, outline: 'none', boxSizing: 'border-box', width: '100%', transition: 'border-color 0.14s' };
  const lbl = { ...TT.label, marginBottom: 6 } as React.CSSProperties;
  const onFieldFocus = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => { e.currentTarget.style.borderColor = 'var(--accent)'; };
  const onFieldBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => { e.currentTarget.style.borderColor = 'var(--border-default)'; };
  const seg = (m: AdjMethod): React.CSSProperties => ({ flex: 1, fontSize: 12.5, fontWeight: 600, height: 34, borderRadius: 8, cursor: 'pointer', textAlign: 'center', border: 'none', background: method === m ? 'var(--accent)' : 'transparent', color: method === m ? 'var(--accent-text)' : 'var(--text-secondary)', fontFamily: T.font.sans, transition: 'all 0.15s' });
  const METHOD_HINT: Record<AdjMethod, string> = {
    percent: 'Σταθερό ποσοστό αύξησης, όπως το συμφωνήσατε στο μισθωτήριο.',
    cpi: 'Επίσημος Δείκτης Τιμών Καταναλωτή της ΕΛΣΤΑΤ. Βάλε την ετήσια μεταβολή.',
    manual: 'Όρισε απευθείας το νέο μίσθωμα, όπως το συμφωνήσατε.',
  };
  // Πεδίο ποσού με διακριτικό σύμβολο (€ ή %) στη δεξιά άκρη, αριθμοί δεξιά.
  const money = (value: string, on: (v: string) => void, suffix: string) => (
    <div style={{ position: 'relative' }}>
      <input value={value} onChange={e => on(e.target.value)} onFocus={onFieldFocus} onBlur={onFieldBlur} inputMode="decimal" placeholder="0"
        style={{ ...field, paddingRight: 30, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} />
      <span style={{ position: 'absolute', right: 13, top: 0, height: 40, display: 'flex', alignItems: 'center', color: 'var(--text-tertiary)', fontSize: 14, pointerEvents: 'none' }}>{suffix}</span>
    </div>
  );

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 18, width: 'min(720px, 100%)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: 'var(--elev-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 24px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...TT.h2, display: 'flex', alignItems: 'center', gap: 7 }}>Αναπροσαρμογή ενοικίου<InfoHint>Ετοιμάζει την επίσημη έγγραφη ειδοποίηση προς τον μισθωτή για το νέο μίσθωμα. Υπολογίζει το νέο ποσό, το υπογράφεις ηλεκτρονικά και βγαίνει υπογεγραμμένο PDF με αριθμό εγγράφου και QR επαλήθευσης, έτοιμο να το κοινοποιήσεις.</InfoHint></div>
            <div style={{ ...TT.bodySm, marginTop: 2 }}>Επίσημη ειδοποίηση προς τον μισθωτή, με ηλεκτρονική υπογραφή και επαλήθευση</div>
          </div>
          <button onClick={onClose} aria-label="Κλείσιμο" style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: 4 }}>×</button>
        </div>

        <div style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loading ? <div style={{ ...TT.bodySm }}>Φόρτωση…</div> : props.length === 0 ? <div style={{ ...TT.bodySm }}>Δεν υπάρχουν ακίνητα.</div> : (
            <>
              <ScanButton label="Σάρωσε έγγραφο" hint="Γρήγορη καταχώρηση στοιχείων." onExtract={doc => {
                if (doc.tenant_name) setTenant(doc.tenant_name);
                if (doc.monthly_rent) setCurrentRent(String(doc.monthly_rent));
                if (doc.landlord_name && !ownerName.trim()) setOwnerName(doc.landlord_name);
              }} />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12 }}>
                <div><div style={lbl}>Ακίνητο</div><Select value={propId} onChange={setPropId} options={props.map(p => ({ value: p.id, label: p.name }))} placeholder="Επιλογή ακινήτου" /></div>
                <div><div style={lbl}>Μισθωτής</div><input value={tenant} onChange={e => setTenant(e.target.value)} onFocus={onFieldFocus} onBlur={onFieldBlur} placeholder="Ονοματεπώνυμο" style={field} /></div>
              </div>

              <div>
                <div style={lbl}>Μέθοδος αναπροσαρμογής</div>
                <div style={{ display: 'flex', gap: 3, padding: 3, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 11 }}>
                  <button onClick={() => setMethod('percent')} style={seg('percent')}>Ποσοστό</button>
                  <button onClick={() => setMethod('cpi')} style={seg('cpi')}>ΔΤΚ (ΕΛΣΤΑΤ)</button>
                  <button onClick={() => setMethod('manual')} style={seg('manual')}>Χειροκίνητο</button>
                </div>
                <div style={{ ...TT.bodySm, marginTop: 8, lineHeight: 1.5 }}>{METHOD_HINT[method]}</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 12 }}>
                <div><div style={lbl}>Τρέχον μίσθωμα</div>{money(currentRent, setCurrentRent, '€')}</div>
                {method === 'manual'
                  ? <div><div style={lbl}>Νέο μίσθωμα</div>{money(newRentManual, setNewRentManual, '€')}</div>
                  : <div><div style={lbl}>{method === 'cpi' ? 'Μεταβολή ΔΤΚ' : 'Ποσοστό'}</div>{money(percent, setPercent, '%')}</div>}
                <div><div style={{ ...lbl, display: 'flex', alignItems: 'center', gap: 5 }}>Ισχύς από<InfoHint>Η ημερομηνία από την οποία εφαρμόζεται το νέο μίσθωμα. Κοινοποίησε την ειδοποίηση στον μισθωτή εγκαίρως, τηρώντας την προθεσμία που ορίζει το μισθωτήριο ή ο νόμος.</InfoHint></div><DateField value={effective} onChange={setEffective} /></div>
              </div>

              {/* Live αποτέλεσμα: Τρέχον → Νέο, ουδέτερο μελάνι, χρώμα μόνο σε μείωση */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', padding: '15px 18px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 12 }}>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>Τρέχον</div>
                  <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums', marginTop: 3, fontFamily: T.font.sans }}>{pEur(res.currentRent)}</div>
                </div>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>Νέο μίσθωμα</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', marginTop: 2, letterSpacing: '-0.01em', fontFamily: T.font.sans }}>{pEur(res.newRent)}</div>
                </div>
                <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>Μεταβολή</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: res.increase >= 0 ? 'var(--text-secondary)' : 'var(--negative)', fontVariantNumeric: 'tabular-nums', marginTop: 4, fontFamily: T.font.sans }}>{pPct(res.pctApplied)} · {res.increase >= 0 ? '+' : ''}{pEur(res.increase)}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12 }}>
                <div><div style={lbl}>Εκμισθωτής (υπογράφων)</div><input value={ownerName} onChange={e => setOwnerName(e.target.value)} onFocus={onFieldFocus} onBlur={onFieldBlur} placeholder="Ονοματεπώνυμο ή επωνυμία" style={field} /></div>
                <div><div style={lbl}>Τόπος</div><input value={place} onChange={e => setPlace(e.target.value)} onFocus={onFieldFocus} onBlur={onFieldBlur} placeholder="π.χ. Αθήνα" style={field} /></div>
              </div>

              <div>
                <div style={{ ...lbl, display: 'flex', alignItems: 'center', gap: 5 }}>Ηλεκτρονική υπογραφή<InfoHint>Υπόγραψε με το ποντίκι ή το δάχτυλο. Η υπογραφή ενσωματώνεται στο PDF και, μαζί με το QR, το καθιστά επαληθεύσιμο έγγραφο.</InfoHint></div>
                <SignaturePad onChange={setSig} height={92} />
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '11px 13px', borderRadius: 11, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.55, fontFamily: T.font.sans }}>
                  Ιδιωτική ειδοποίηση με ισχύ έγγραφης απόδειξης. Η <strong style={{ color: 'var(--text-primary)' }}>αλλαγή μισθώματος</strong> δηλώνεται επίσημα στη «Δήλωση Πληροφοριακών Στοιχείων Μίσθωσης» στο <a href="https://www.aade.gr/misthoseis-akiniton" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>myAADE</a>.
                </div>
              </div>

              {err && <div style={{ fontSize: 12.5, color: 'var(--negative)', background: 'var(--negative-soft)', border: '1px solid var(--negative-border)', borderRadius: 10, padding: '10px 14px' }}>{err}</div>}
            </>
          )}
        </div>

        {pending ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 24px', borderTop: '1px solid var(--border-subtle)', flexShrink: 0, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans }}>
                {archived ? 'Αποθηκεύτηκε στα έγγραφα του ακινήτου.' : 'Να αποθηκευτεί στα έγγραφα του ακινήτου;'}
              </div>
              {!archived && <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 2, fontFamily: T.font.sans }}>Αρχειοθετείται με ημερομηνία ισχύος {grDate(effective)}, σε χρονολογική σειρά.</div>}
            </div>
            {!archived && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button type="button" onClick={answerByVoice} disabled={archiving} aria-label="Απάντησε με φωνή" title="Απάντησε με φωνή: «ναι» ή «αργότερα»"
                  style={{ width: 34, height: 34, borderRadius: '50%', border: `1px solid ${listening ? 'var(--accent)' : 'var(--border-default)'}`, background: listening ? 'var(--accent-soft)' : 'var(--bg-surface)', color: listening ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v4" /></svg>
                </button>
                <Btn variant="secondary" onClick={onClose}>Ίσως αργότερα</Btn>
                <Btn variant="primary" onClick={archive} disabled={archiving}>{archiving ? 'Αποθήκευση…' : 'Ναι, αποθήκευσε'}</Btn>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '14px 24px', borderTop: '1px solid var(--border-subtle)', flexShrink: 0 }}>
            <Btn variant="secondary" onClick={onClose}>Άκυρο</Btn>
            <Btn variant="primary" onClick={generate} disabled={busy || !sig || num(currentRent) <= 0}>{busy ? 'Δημιουργία…' : 'Υπογεγραμμένο PDF'}</Btn>
          </div>
        )}
      </div>
    </div>
  );
}
