'use client';

// ═══════════════════════════════════════════════════════════════════════════
// LeaseModal — Ιδιωτικό συμφωνητικό μίσθωσης (μισθωτήριο) από άκρη σε άκρη:
// στοιχεία μερών και όρων → ηλεκτρονική υπογραφή ΚΑΙ ΤΩΝ ΔΥΟ μερών → επίσημο,
// επαληθεύσιμο true-PDF (αρ. εγγράφου + QR) → αρχειοθέτηση στα έγγραφα του
// ακινήτου → ενημέρωση της καρτέλας ενοικιαστή → υπενθύμιση για τη «Δήλωση
// Πληροφοριακών Στοιχείων Μίσθωσης» στο myAADE.
//
// Η νομική λογική (διάρκεια, λήξη, ελάχιστη τριετία, προθεσμία δήλωσης, όροι)
// ζει καθαρή και δοκιμασμένη στο lib/documents/lease.ts.
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { T, TT, Btn, Spinner, EmptyState } from '@/components/Theme';
import { Building2 } from 'lucide-react';
import { InfoHint } from './InfoHint';
import DateField from './DateField';
import { CustomSelect as Select } from './UIComponents';
import ScanButton from './ScanButton';
import SignaturePad from '@/components/SignaturePad';
import { grDate, todayIso, num, archivePdfToProperty, askByVoice, speechSupported } from './docUtils';
import { computeLease, leasePreamble, leaseTerms, type LeaseUse } from '@/lib/documents/lease';
import { issueDocument } from '@/lib/documents/issue';
import { generateReportPdf, reportPdfBlob, pEur, type PdfReportModel } from '@/lib/pdf/pdfReport';
import type { ReportBranding } from '@/lib/reportBranding';

interface Prop { id: string; name: string; address: string | null; sqm?: number | null; atak?: string | null }

export default function LeaseModal({ open, onClose, userId, supabase, branding, propertyId }: {
  open: boolean; onClose: () => void; userId: string; supabase: SupabaseClient; branding?: ReportBranding | null; propertyId?: string;
}) {
  const [props, setProps] = useState<Prop[]>([]);
  const [propId, setPropId] = useState(propertyId || '');
  const [loading, setLoading] = useState(true);
  // Μέρη
  const [landlord, setLandlord] = useState('');
  const [landlordAfm, setLandlordAfm] = useState('');
  const [tenant, setTenant] = useState('');
  const [tenantAfm, setTenantAfm] = useState('');
  // Όροι
  const [use, setUse] = useState<LeaseUse>('residence');
  const [rent, setRent] = useState('');
  const [deposit, setDeposit] = useState('');
  const [start, setStart] = useState(todayIso());
  const [years, setYears] = useState('3');
  const [adjust, setAdjust] = useState('');
  const [payDay, setPayDay] = useState('5');
  const [place, setPlace] = useState('');
  // Υπογραφές
  const [sigL, setSigL] = useState('');
  const [sigT, setSigT] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // Μετά τη δημιουργία
  const [pending, setPending] = useState<{ model: PdfReportModel; fname: string } | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [archived, setArchived] = useState(false);
  const [listening, setListening] = useState(false);

  // Φόρτωση ακινήτων και προσυμπλήρωση εκμισθωτή από το branding. Όλα τα setState
  // γίνονται στο callback (όχι στο σώμα του effect), ώστε να μην προκαλούνται
  // αλυσιδωτά renders.
  useEffect(() => {
    if (!open) return;
    supabase.from('user_properties').select('id,name,address,sqm,atak').eq('user_id', userId).order('name')
      .then(({ data }) => {
        const ps = (data || []) as Prop[];
        setProps(ps);
        setPropId(prev => prev || propertyId || ps[0]?.id || '');
        if (branding?.companyName) setLandlord(prev => prev || branding.companyName || '');
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId, supabase]);

  // Προσυμπλήρωση από τα ήδη καταχωρημένα στοιχεία ενοικιαστή του ακινήτου.
  useEffect(() => {
    if (!open || !propId) return;
    (async () => {
      const { data } = await supabase.from('tenants').select('full_name,afm,monthly_rent,deposit,lease_start')
        .eq('property_id', propId).eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
      const t = data as { full_name?: string; afm?: string; monthly_rent?: number; deposit?: number; lease_start?: string } | null;
      if (!t) return;
      if (t.full_name) setTenant(p => p || t.full_name!);
      if (t.afm) setTenantAfm(p => p || String(t.afm));
      if (t.monthly_rent) setRent(p => p || String(t.monthly_rent));
      if (t.deposit) setDeposit(p => p || String(t.deposit));
    })();
  }, [open, propId, userId, supabase]);

  const prop = props.find(p => p.id === propId);
  const res = useMemo(() => computeLease({
    monthlyRent: num(rent), deposit: num(deposit), start, years: num(years) || 3,
    use, adjustmentPct: num(adjust), paymentDay: num(payDay) || 5,
  }), [rent, deposit, start, years, use, adjust, payDay]);

  if (!open) return null;

  const ready = !!prop && num(rent) > 0 && !!tenant.trim() && !!sigL && !!sigT;

  const generate = async () => {
    setErr('');
    if (!prop) { setErr('Διάλεξε ακίνητο.'); return; }
    if (num(rent) <= 0) { setErr('Συμπλήρωσε το μηνιαίο μίσθωμα.'); return; }
    if (!tenant.trim()) { setErr('Συμπλήρωσε το ονοματεπώνυμο του μισθωτή.'); return; }
    if (!sigL || !sigT) { setErr('Χρειάζονται οι υπογραφές και των δύο μερών.'); return; }
    setBusy(true);
    try {
      const parties = {
        landlordName: landlord.trim() || undefined, landlordAfm: landlordAfm.trim() || undefined,
        tenantName: tenant.trim() || undefined, tenantAfm: tenantAfm.trim() || undefined,
        propertyAddress: prop.address || prop.name, sqm: prop.sqm ?? undefined, atak: prop.atak ?? undefined,
      };
      const issued = await issueDocument(supabase, {
        userId, docType: 'Ιδιωτικό συμφωνητικό μίσθωσης', subject: [prop.name, tenant.trim()].filter(Boolean).join(' · '),
        period: `${grDate(res.start)} έως ${grDate(res.end)}`,
        summary: { rent: res.monthlyRent, deposit: res.deposit, months: res.months, use },
      });
      const model: PdfReportModel = {
        branding: branding ?? null, docType: 'Ιδιωτικό συμφωνητικό μίσθωσης',
        title: 'Ιδιωτικό συμφωνητικό μίσθωσης',
        subtitle: [prop.name, prop.address].filter(Boolean).join(' · '),
        meta: { id: issued.id, issuedAt: issued.issuedAt, verifyUrl: issued.verifyUrl, asOfLabel: 'Ημερομηνία', note: `Διάρκεια ${grDate(res.start)} έως ${grDate(res.end)}` },
        sections: [
          { type: 'note', text: leasePreamble(parties, res, use) },
          { type: 'rows', title: 'Βασικοί όροι', rows: [
            { label: 'Μηνιαίο μίσθωμα', value: pEur(res.monthlyRent), kind: 'result' },
            ...(res.deposit > 0 ? [{ label: 'Εγγύηση', value: pEur(res.deposit) }] : []),
            { label: 'Έναρξη', value: grDate(res.start) },
            { label: 'Λήξη', value: grDate(res.end) },
            { label: 'Διάρκεια', value: `${res.months} μήνες` },
            { label: 'Ημέρα καταβολής', value: `${res.paymentDay}η κάθε μήνα` },
            ...(res.adjustmentPct > 0 ? [{ label: 'Ετήσια αναπροσαρμογή', value: `${res.adjustmentPct.toLocaleString('el-GR', { maximumFractionDigits: 2 })} %` }] : []),
          ] },
          ...leaseTerms(res, use).map(t => ({ type: 'note' as const, text: `${t.title}\n${t.text}` })),
          { type: 'sign', signers: [
            { role: 'Ο/Η εκμισθωτής', name: landlord.trim() || undefined, image: sigL, place: place.trim() || undefined, date: grDate(todayIso()) },
            { role: 'Ο/Η μισθωτής', name: tenant.trim() || undefined, image: sigT, place: place.trim() || undefined, date: grDate(todayIso()) },
          ] },
        ],
        disclaimer: 'Ιδιωτικό συμφωνητικό μίσθωσης, τυποποιημένο υπόδειγμα. Δηλώνεται ηλεκτρονικά στο myAADE. Για ειδικούς όρους συμβουλευτείτε νομικό σύμβουλο.',
      };
      const fname = `Μισθωτήριο_${prop.name}_${grDate(res.start)}`.replace(/[\/\s]+/g, '_');
      await generateReportPdf(model, fname);
      setPending({ model, fname });
    } catch (e) { setErr((e as Error)?.message || 'Αποτυχία δημιουργίας.'); }
    finally { setBusy(false); }
  };

  // Αρχειοθέτηση + ενημέρωση της καρτέλας ενοικιαστή (ώστε να μη γράφονται δύο φορές).
  const archive = async () => {
    if (!pending || !prop) return;
    setArchiving(true); setErr('');
    try {
      await archivePdfToProperty({
        supabase, userId, propertyId: prop.id, blob: await reportPdfBlob(pending.model), fileName: pending.fname,
        title: `Μισθωτήριο · ${tenant.trim()} · από ${grDate(res.start)}`,
        notes: `Μίσθωμα ${pEur(res.monthlyRent)}${res.deposit > 0 ? `, εγγύηση ${pEur(res.deposit)}` : ''}, έως ${grDate(res.end)}`,
        docDate: res.start, category: 'lease', supplier: tenant.trim(),
      });

      // Ενημέρωση/δημιουργία ενοικιαστή από το υπογεγραμμένο συμφωνητικό.
      const payload = { full_name: tenant.trim(), afm: tenantAfm.trim() || null, monthly_rent: res.monthlyRent, deposit: res.deposit || null, lease_start: res.start, lease_end: res.end };
      const { data: cur } = await supabase.from('tenants').select('id').eq('property_id', prop.id).eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if ((cur as { id?: string } | null)?.id) await supabase.from('tenants').update(payload).eq('id', (cur as { id: string }).id);
      else await supabase.from('tenants').insert({ property_id: prop.id, user_id: userId, ...payload });

      setArchived(true);
      setTimeout(onClose, 1400);
    } catch { setErr('Η αρχειοθέτηση απέτυχε. Το PDF έχει ήδη κατέβει.'); }
    finally { setArchiving(false); }
  };

  const answerByVoice = () => {
    const started = askByVoice({ onYes: archive, onNo: onClose, onEnd: () => setListening(false) });
    if (started) setListening(true);
  };

  const field: React.CSSProperties = { height: 40, padding: '0 13px', borderRadius: T.radius.inner, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 14, fontFamily: T.font.sans, outline: 'none', boxSizing: 'border-box', width: '100%', transition: 'border-color 0.14s' };
  const lbl = { ...TT.label, marginBottom: 6 } as React.CSSProperties;
  const onF = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = 'var(--accent)'; };
  const onB = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = 'var(--border-default)'; };
  const seg = (u: LeaseUse): React.CSSProperties => ({ flex: 1, fontSize: 12.5, fontWeight: 600, height: 34, borderRadius: 8, cursor: 'pointer', textAlign: 'center', border: 'none', background: use === u ? 'var(--accent)' : 'transparent', color: use === u ? 'var(--accent-text)' : 'var(--text-secondary)', fontFamily: T.font.sans, transition: 'all 0.15s' });
  const money = (value: string, on: (v: string) => void, suffix: string) => (
    <div style={{ position: 'relative' }}>
      <input value={value} onChange={e => on(e.target.value)} onFocus={onF} onBlur={onB} inputMode="decimal" placeholder="0"
        style={{ ...field, paddingRight: 32, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} />
      <span style={{ position: 'absolute', right: 13, top: 0, height: 40, display: 'flex', alignItems: 'center', color: 'var(--text-tertiary)', fontSize: 14, pointerEvents: 'none' }}>{suffix}</span>
    </div>
  );
  const stat = (label: string, value: string, strong = false) => (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>{label}</div>
      <div style={{ fontSize: strong ? 16 : 13.5, fontWeight: strong ? 700 : 600, color: strong ? 'var(--text-primary)' : 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums', marginTop: 3, fontFamily: T.font.sans }}>{value}</div>
    </div>
  );

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 18, width: 'min(760px, 100%)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: 'var(--elev-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 24px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h4" /></svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...TT.h2, display: 'flex', alignItems: 'center', gap: 7 }}>Μισθωτήριο<InfoHint>Συντάσσει ολοκληρωμένο ιδιωτικό συμφωνητικό μίσθωσης με τους τυποποιημένους όρους, το υπογράφουν ηλεκτρονικά και τα δύο μέρη, και παράγεται επαληθεύσιμο PDF με αριθμό εγγράφου και QR. Αρχειοθετείται στα έγγραφα του ακινήτου και ενημερώνει την καρτέλα ενοικιαστή.</InfoHint></div>
            <div style={{ ...TT.bodySm, marginTop: 2 }}>Ιδιωτικό συμφωνητικό με υπογραφή και των δύο μερών</div>
          </div>
          <button onClick={onClose} aria-label="Κλείσιμο" style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: 4 }}>×</button>
        </div>

        <div style={{ padding: '18px 24px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 15 }}>
          {loading ? <Spinner size={18} label="Φόρτωση…" /> : props.length === 0 ? <EmptyState icon={<Building2 size={20} />} title="Δεν υπάρχουν ακίνητα" hint="Πρόσθεσε ακίνητο για να συντάξεις μισθωτήριο." /> : (
            <>
              <ScanButton label="Σάρωσε έγγραφο" hint="Γρήγορη καταχώρηση στοιχείων." onExtract={doc => {
                if (doc.tenant_name) setTenant(doc.tenant_name);
                if (doc.landlord_name) setLandlord(doc.landlord_name);
                if (doc.afm) setTenantAfm(String(doc.afm));
                if (doc.monthly_rent) setRent(String(doc.monthly_rent));
                if (doc.deposit) setDeposit(String(doc.deposit));
                if (doc.lease_start) setStart(doc.lease_start);
              }} />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12 }}>
                <div><div style={lbl}>Ακίνητο</div><Select value={propId} onChange={setPropId} options={props.map(p => ({ value: p.id, label: p.name }))} placeholder="Επιλογή ακινήτου" /></div>
                <div>
                  <div style={lbl}>Χρήση</div>
                  <div style={{ display: 'flex', gap: 3, padding: 3, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 10 }}>
                    <button onClick={() => setUse('residence')} style={seg('residence')}>Κατοικία</button>
                    <button onClick={() => setUse('professional')} style={seg('professional')}>Επαγγελματική</button>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12 }}>
                <div><div style={lbl}>Εκμισθωτής</div><input value={landlord} onChange={e => setLandlord(e.target.value)} onFocus={onF} onBlur={onB} placeholder="Ονοματεπώνυμο ή επωνυμία" style={field} /></div>
                <div><div style={lbl}>ΑΦΜ εκμισθωτή</div><input value={landlordAfm} onChange={e => setLandlordAfm(e.target.value)} onFocus={onF} onBlur={onB} placeholder="Προαιρετικό" inputMode="numeric" style={field} /></div>
                <div><div style={lbl}>Μισθωτής</div><input value={tenant} onChange={e => setTenant(e.target.value)} onFocus={onF} onBlur={onB} placeholder="Ονοματεπώνυμο" style={field} /></div>
                <div><div style={lbl}>ΑΦΜ μισθωτή</div><input value={tenantAfm} onChange={e => setTenantAfm(e.target.value)} onFocus={onF} onBlur={onB} placeholder="Προαιρετικό" inputMode="numeric" style={field} /></div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 12 }}>
                <div><div style={lbl}>Μηνιαίο μίσθωμα</div>{money(rent, setRent, '€')}</div>
                <div><div style={{ ...lbl, display: 'flex', alignItems: 'center', gap: 5 }}>Εγγύηση<InfoHint>Συνήθως ένα ή δύο μισθώματα. Δεν συμψηφίζεται με μισθώματα και επιστρέφεται ατόκως στη λήξη, εφόσον δεν υπάρχουν φθορές ή οφειλές.</InfoHint></div>{money(deposit, setDeposit, '€')}</div>
                <div><div style={lbl}>Έναρξη</div><DateField value={start} onChange={setStart} /></div>
                <div><div style={{ ...lbl, display: 'flex', alignItems: 'center', gap: 5 }}>Διάρκεια<InfoHint>Στις μισθώσεις κατοικίας ισχύει η κατά νόμο ελάχιστη τριετής διάρκεια, ακόμη και αν συμφωνηθεί μικρότερη.</InfoHint></div>{money(years, setYears, 'έτη')}</div>
                <div><div style={lbl}>Αναπροσαρμογή</div>{money(adjust, setAdjust, '%')}</div>
                <div><div style={lbl}>Ημέρα πληρωμής</div>{money(payDay, setPayDay, 'ημ.')}</div>
              </div>

              {/* Σύνοψη διάρκειας — ουδέτερη, με προειδοποίηση μόνο όπου έχει νόημα */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', padding: '14px 16px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 12 }}>
                {stat('Έναρξη', grDate(res.start))}
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                {stat('Λήξη', grDate(res.end), true)}
                {stat('Διάρκεια', `${res.months} μήνες`)}
                <div style={{ marginLeft: 'auto' }}>{stat('Δήλωση έως', grDate(res.declarationDeadline))}</div>
              </div>
              {res.belowLegalMinimum && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '11px 13px', borderRadius: 10, background: 'var(--warning-soft)', border: '1px solid var(--warning-border)' }}>
                  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
                  <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.55, fontFamily: T.font.sans }}>Στην κατοικία ισχύει η <strong style={{ color: 'var(--text-primary)' }}>ελάχιστη τριετής διάρκεια</strong> κατά νόμο, ακόμη και με μικρότερη συμφωνία.</div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 14 }}>
                <div>
                  <div style={{ ...lbl, display: 'flex', alignItems: 'center', gap: 5 }}>Υπογραφή εκμισθωτή<InfoHint>Υπόγραψε με το ποντίκι ή το δάχτυλο. Η υπογραφή ενσωματώνεται στο PDF και, μαζί με το QR, το καθιστά επαληθεύσιμο.</InfoHint></div>
                  <SignaturePad onChange={setSigL} height={92} />
                </div>
                <div>
                  <div style={lbl}>Υπογραφή μισθωτή</div>
                  <SignaturePad onChange={setSigT} height={92} />
                </div>
              </div>

              <div style={{ maxWidth: 260 }}>
                <div style={lbl}>Τόπος υπογραφής</div>
                <input value={place} onChange={e => setPlace(e.target.value)} onFocus={onF} onBlur={onB} placeholder="Παράδειγμα: Αθήνα" style={field} />
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '11px 13px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.55, fontFamily: T.font.sans }}>
                  Μετά την υπογραφή, υπόβαλε τη <strong style={{ color: 'var(--text-primary)' }}>Δήλωση Πληροφοριακών Στοιχείων Μίσθωσης</strong> στο <a href="https://www.aade.gr/misthoseis-akiniton" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>myAADE</a>, έως {grDate(res.declarationDeadline)}.
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
                {archived ? 'Αποθηκεύτηκε και ενημερώθηκε ο ενοικιαστής.' : 'Να αποθηκευτεί στα έγγραφα του ακινήτου;'}
              </div>
              {!archived && <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 2, fontFamily: T.font.sans }}>Αρχειοθετείται με ημερομηνία έναρξης {grDate(res.start)} και ενημερώνει την καρτέλα ενοικιαστή.</div>}
            </div>
            {!archived && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {speechSupported() && <button type="button" onClick={answerByVoice} disabled={archiving} aria-label="Απάντησε με φωνή" title="Απάντησε με φωνή: «ναι» ή «αργότερα»"
                  style={{ width: 34, height: 34, borderRadius: '50%', border: `1px solid ${listening ? 'var(--accent)' : 'var(--border-default)'}`, background: listening ? 'var(--accent-soft)' : 'var(--bg-surface)', color: listening ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v4" /></svg>
                </button>}
                <Btn variant="secondary" onClick={onClose}>Ίσως αργότερα</Btn>
                <Btn variant="primary" onClick={archive} disabled={archiving}>{archiving ? 'Αποθήκευση…' : 'Ναι, αποθήκευσε'}</Btn>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '14px 24px', borderTop: '1px solid var(--border-subtle)', flexShrink: 0 }}>
            <Btn variant="secondary" onClick={onClose}>Άκυρο</Btn>
            <Btn variant="primary" onClick={generate} disabled={busy || !ready}>{busy ? 'Δημιουργία…' : 'Υπογεγραμμένο μισθωτήριο'}</Btn>
          </div>
        )}
      </div>
    </div>
  );
}
