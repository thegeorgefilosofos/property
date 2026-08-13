'use client';

// ═══════════════════════════════════════════════════════════════════════════
// RentAdjustmentModal — Ειδοποίηση αναπροσαρμογής μισθώματος με e-signature (P3.2).
// Επιλογή ακινήτου/μισθωτή, τρέχον μίσθωμα, μέθοδος (ποσοστό/ΔΤΚ/χειροκίνητο),
// ημερομηνία ισχύος, ηλεκτρονική υπογραφή εκμισθωτή → επίσημο, επαληθεύσιμο
// true-PDF με ενσωματωμένη υπογραφή (lib/pdf/pdfReport section 'sign').
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as properties from '@/lib/data/properties';
import * as rentStore from '@/lib/data/rent';
import * as tenantStore from '@/lib/data/tenants';
import { T, TT, Btn, Spinner, EmptyState, Modal, fixedCols } from '@/components/Theme';
import { Building2 } from 'lucide-react';
import { InfoHint } from './InfoHint';

import { CustomSelect as Select, DatePicker } from './UIComponents';
import ScanButton from './ScanButton';
import SignaturePad from '@/components/SignaturePad';
import { grDate, todayIso, num, archivePdfToProperty } from './docUtils';
import { computeRentAdjustment, adjustmentNoticeText, type AdjMethod } from '@/lib/documents/rentAdjustment';
import { issueDocument } from '@/lib/documents/issue';
import { generateReportPdf, reportPdfBlob, pEur, pPct, type PdfReportModel } from '@/lib/pdf/pdfReport';
import type { ReportBranding } from '@/lib/reportBranding';
import { MYAADE } from '@/lib/tax/aade';
import { aadeTitle } from '@/components/AadeLink';
import { failed } from '@/lib/core/dbError';
import { acceptNumeric, PCT_MAX } from '@/lib/core/numInput';

interface Prop { id: string; name: string; address: string | null }

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

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    properties.list<Prop>(supabase, userId, { orderBy: 'name' })
      .then(ps => { setProps(ps); setPropId(prev => prev || ps[0]?.id || ''); setLoading(false); });
    if (branding?.companyName && !ownerName) setOwnerName(branding.companyName);
  }, [open, userId, supabase]);

  // Prefill μισθωτή + τρέχοντος μισθώματος από τα δεδομένα του ακινήτου.
  useEffect(() => {
    if (!open || !propId) return;
    (async () => {
      const [t, latest] = await Promise.all([
        tenantStore.current<{ full_name: string | null }>(supabase, propId, 'full_name', userId),
        rentStore.latestAmount(supabase, propId, userId),
      ]);
      if (t?.full_name) setTenant(t.full_name);
      if (latest) setCurrentRent(String(latest));
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
        userId, docType: 'Ειδοποίηση αναπροσαρμογής μισθώματος', // Ίδιος λόγος με το μισθωτήριο: το «αντικείμενο» είναι δημόσιο.
        subject: prop.name,
        period: `Ισχύς από ${grDate(effective)}`, summary: { currentRent: res.currentRent, newRent: res.newRent, pct: res.pctApplied, tenant: tenant.trim() },
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
    // Το `catch (e: any)` άφηνε το `e?.message` να γραφτεί σε ΟΤΙΔΗΠΟΤΕ, χωρίς
    // εγγύηση ότι το πεδίο υπάρχει ή ότι είναι κείμενο. Το `e` είναι `unknown`
    // εξ ορισμού: μόνο ο έλεγχος `instanceof Error` δικαιολογεί το `.message`.
    } catch (e) { setErr(failed('Η αναπροσαρμογή δεν δημιουργήθηκε', e)); }
    finally { setBusy(false); }
  };

  // Αρχειοθέτηση στα έγγραφα του ακινήτου, με ημερομηνία (χρονολογική σειρά).
  const archive = async () => {
    if (!pending || !prop) return;
    setArchiving(true); setErr('');
    try {
      await archivePdfToProperty({
        supabase, userId, propertyId: prop.id, blob: await reportPdfBlob(pending.model), fileName: pending.fname,
        title: `Αναπροσαρμογή μισθώματος · ισχύς από ${grDate(effective)}`,
        notes: `Νέο μίσθωμα ${pEur(res.newRent)} (από ${pEur(res.currentRent)}, ${pPct(res.pctApplied)})`,
        docDate: effective, category: 'lease', supplier: tenant.trim(),
      });
      setArchived(true);
      setTimeout(onClose, 1200);
    } catch { setErr('Η αρχειοθέτηση απέτυχε. Το PDF έχει ήδη κατέβει.'); }
    finally { setArchiving(false); }
  };

  // Το ύψος ήταν literal 40, δηλαδή η τιμή του T.h.lg στο ποντίκι — αλλά ΜΟΝΟ
  // στο ποντίκι: με δάχτυλο η κλίμακα ανεβαίνει στα 44 και το πεδίο έμενε στα 40.
  const field: React.CSSProperties = { height: T.h.lg, padding: '0 13px', borderRadius: T.radius.inner, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 14, fontFamily: T.font.sans, outline: 'none', boxSizing: 'border-box', width: '100%', transition: 'border-color 0.14s' };
  const lbl = { ...TT.label, marginBottom: 6 } as React.CSSProperties;
  const onFieldFocus = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => { e.currentTarget.style.borderColor = 'var(--accent)'; };
  const onFieldBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => { e.currentTarget.style.borderColor = 'var(--border-default)'; };
  // Ύψος από την κοινή κλίμακα: το ίδιο segmented control ζει αυτούσιο και στο
  // LeaseModal με το ίδιο literal 34, οπότε κάθε τοπική αλλαγή τα ξεσυγχρόνιζε.
  const seg = (m: AdjMethod): React.CSSProperties => ({ flex: 1, fontSize: 13, fontWeight: 600, height: T.h.md, borderRadius: T.radius.inner, cursor: 'pointer', textAlign: 'center', border: 'none', background: method === m ? 'var(--accent)' : 'transparent', color: method === m ? 'var(--accent-text)' : 'var(--text-secondary)', fontFamily: T.font.sans, transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s' });
  const METHOD_HINT: Record<AdjMethod, string> = {
    percent: 'Σταθερό ποσοστό αύξησης, όπως το συμφωνήσατε στο μισθωτήριο.',
    cpi: 'Επίσημος Δείκτης Τιμών Καταναλωτή της ΕΛΣΤΑΤ. Βάλε την ετήσια μεταβολή.',
    manual: 'Όρισε απευθείας το νέο μίσθωμα, όπως το συμφωνήσατε.',
  };
  // Πεδίο ποσού με διακριτικό σύμβολο (€ ή %) στη δεξιά άκρη, αριθμοί δεξιά.
  //
  // ΤΟ ΦΙΛΤΡΟ ΔΕΝ ΕΙΝΑΙ ΚΑΛΛΩΠΙΣΜΟΣ. Το πεδίο δεχόταν «-500» και «12ε», και το
  // αποτέλεσμα έφτανε σε υπογεγραμμένο PDF με QR επαλήθευσης: αρνητικό μίσθωμα
  // σε επίσημη ειδοποίηση προς τον μισθωτή. Το ποσοστό δέχεται έως 100, γιατί
  // πάνω από αυτό δεν είναι ποσοστό (lib/core/numInput.ts).
  const money = (value: string, on: (v: string) => void, suffix: string, max?: number) => (
    <div style={{ position: 'relative' }}>
      <input value={value} onChange={e => { const v = acceptNumeric(e.target.value, max); if (v !== null) on(v); }}
        onFocus={onFieldFocus} onBlur={onFieldBlur} inputMode="decimal" placeholder=""
        style={{ ...field, paddingRight: 30, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} />
      {/* Ίδιο ύψος με το πεδίο, από την ΙΔΙΑ πηγή: με literal 40 εδώ και πεδίο
          που γίνεται 44 στο δάχτυλο, το «€» καθόταν 2px ψηλότερα από το ποσό. */}
      <span style={{ position: 'absolute', right: 13, top: 0, height: T.h.lg, display: 'flex', alignItems: 'center', color: 'var(--text-tertiary)', fontSize: 14, pointerEvents: 'none' }}>{suffix}</span>
    </div>
  );

  // ── ΤΟ ΠΑΡΑΘΥΡΟ ΕΓΙΝΕ <Modal> ────────────────────────────────────────────
  // Το κέλυφος ήταν γραμμένο στο χέρι (scrim, radius 18, κεφαλίδα με «×»,
  // υποσέλιδο) και του έλειπαν και οι τρεις συμπεριφορές που δίνει το primitive:
  // Escape δεν έκλεινε, η εστίαση δεν έμπαινε μέσα ούτε γύριζε πίσω, και το
  // φόντο κυλούσε κάτω από ένα παράθυρο 720px με φόρμα ΚΑΙ πίνακα υπογραφής.
  // Το «×» είχε padding 4 (στόχος ~21×30, κάτω από το μέγεθος αφής) και το
  // maxHeight ήταν '92vh' αντί '92dvh', οπότε σε κινητό τα κουμπιά του
  // υποσέλιδου έπεφταν κάτω από τη μπάρα διεύθυνσης.
  //
  // ── ΤΟ ΥΠΟΣΕΛΙΔΟ ΕΧΕΙ ΔΥΟ ΚΑΤΑΣΤΑΣΕΙΣ, ΚΑΙ ΟΙ ΔΥΟ ΜΕΝΟΥΝ ──────────────────
  // Πριν τη δημιουργία: «Ακύρωση» + «Υπογεγραμμένο PDF».
  // Μετά (`pending`): η ερώτηση αρχειοθέτησης στο footerInfo και, όσο δεν έχει
  // αρχειοθετηθεί, τα τρία χειριστήρια της απάντησης (φωνή, «Ίσως αργότερα»,
  // «Ναι, αποθήκευσε») στο footer. Όταν αρχειοθετηθεί μένει μόνο το μήνυμα.
  //
  // ── ΟΣΟ ΓΡΑΦΕΙ, ΤΟ ΠΑΡΑΘΥΡΟ ΔΕΝ ΚΛΕΙΝΕΙ ─────────────────────────────────
  // Η μετατροπή ΠΡΟΣΘΕΤΕΙ έξοδο που δεν υπήρχε: το χειρόγραφο κέλυφος δεν
  // άκουγε πλήκτρα, άρα το Escape δεν έκανε τίποτα. Τώρα κλείνει — και κλείνει
  // και πάνω στην αρχειοθέτηση, που ανεβάζει αρχείο και γράφει εγγραφή. Αν
  // αποτύχει, το «Η αρχειοθέτηση απέτυχε» δεν έχει πού να εμφανιστεί: ο χρήστης
  // μένει να νομίζει ότι το έγγραφο μπήκε στον φάκελο του ακινήτου. Το ίδιο
  // Escape πάνω στη δημιουργία εξαφανίζει τη φόρμα ΜΑΖΙ ΜΕ ΤΗΝ ΥΠΟΓΡΑΦΗ, που
  // δεν ξαναγράφεται με ένα κλικ. Ίδια φρουρά με το Modal του PortfolioTab.
  const closeIfIdle = () => { if (busy || archiving) return; onClose(); };

  const footerInfo = pending ? (
    <span style={{ display: 'inline-block', minWidth: 220 }}>
      <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
        {archived ? 'Αποθηκεύτηκε στα έγγραφα του ακινήτου.' : 'Να αποθηκευτεί στα έγγραφα του ακινήτου;'}
      </span>
      {!archived && <span style={{ display: 'block', fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>Αρχειοθετείται με ημερομηνία ισχύος {grDate(effective)}, σε χρονολογική σειρά.</span>}
    </span>
  ) : undefined;

  const footer = pending ? (
    !archived && (
      <>
        <Btn variant="secondary" onClick={onClose} disabled={archiving}>Ίσως αργότερα</Btn>
        <Btn variant="primary" onClick={archive} disabled={archiving}>{archiving ? 'Αποθήκευση…' : 'Ναι, αποθήκευσε'}</Btn>
      </>
    )
  ) : (
    <>
      <Btn variant="secondary" onClick={onClose} disabled={busy}>Ακύρωση</Btn>
      <Btn variant="primary" onClick={generate} disabled={busy || !sig || num(currentRent) <= 0}>{busy ? 'Δημιουργία…' : 'Υπογεγραμμένο PDF'}</Btn>
    </>
  );

  // ΤΟ ⓘ ΤΟΥ ΤΙΤΛΟΥ ΕΛΕΓΕ ΤΟΝ ΥΠΟΤΙΤΛΟ, ΜΕ ΠΕΡΙΣΣΟΤΕΡΕΣ ΛΕΞΕΙΣ. «Επίσημη έγγραφη
  // ειδοποίηση προς τον μισθωτή … υπογράφεις ηλεκτρονικά … επαλήθευση» — και από
  // κάτω, ορατός χωρίς πάτημα: «Επίσημη ειδοποίηση προς τον μισθωτή, με
  // ηλεκτρονική υπογραφή και επαλήθευση». Έμεινε αυτός που φαίνεται.
  return (
    <Modal open={open} onClose={closeIfIdle} width={720}
      ariaLabel="Δήλωση αναπροσαρμογής"
      title="Αναπροσαρμογή ενοικίου"
      subtitle="Επίσημη ειδοποίηση προς τον μισθωτή, με ηλεκτρονική υπογραφή και επαλήθευση"
      icon={<svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>}
      footer={footer} footerInfo={footerInfo}>
      <>
          {/* Κοινά primitives αντί για δύο γυμνές γραμμές κειμένου: η ίδια «Φόρτωση…»
              και το ίδιο «δεν υπάρχουν ακίνητα» υπήρχαν αυτούσια σε LeaseModal και
              OwnerSplit, με διαφορετική στοίχιση σε κάθε παράθυρο. */}
          {loading ? <Spinner size={18} label="Φόρτωση…" /> : props.length === 0 ? <EmptyState icon={<Building2 size={20} />} title="Κανένα ακίνητο ακόμη" hint="Πρόσθεσε ακίνητο για να συντάξεις δήλωση αναπροσαρμογής." /> : (
            <>
              <ScanButton onExtract={doc => {
                if (doc.tenant_name) setTenant(doc.tenant_name);
                if (doc.monthly_rent) setCurrentRent(String(doc.monthly_rent));
                if (doc.landlord_name && !ownerName.trim()) setOwnerName(doc.landlord_name);
              }} />

              <div {...fixedCols(2, 12, 'start')}>
                <div><div style={lbl}>Ακίνητο</div><Select value={propId} onChange={setPropId} options={props.map(p => ({ value: p.id, label: p.name }))} placeholder="Επιλογή ακινήτου" /></div>
                <div><div style={lbl}>Μισθωτής</div><input value={tenant} onChange={e => setTenant(e.target.value)} onFocus={onFieldFocus} onBlur={onFieldBlur} placeholder="Ονοματεπώνυμο" style={field} /></div>
              </div>

              <div>
                <div style={lbl}>Μέθοδος αναπροσαρμογής</div>
                <div style={{ display: 'flex', gap: 3, padding: 3, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner }}>
                  <button onClick={() => setMethod('percent')} style={seg('percent')}>Ποσοστό</button>
                  <button onClick={() => setMethod('cpi')} style={seg('cpi')}>ΔΤΚ (ΕΛΣΤΑΤ)</button>
                  <button onClick={() => setMethod('manual')} style={seg('manual')}>Χειροκίνητο</button>
                </div>
                <div style={{ ...TT.bodySm, marginTop: 8, lineHeight: 1.5 }}>{METHOD_HINT[method]}</div>
              </div>

              {/* ΤΡΕΙΣ ΙΣΕΣ ΣΤΗΛΕΣ, ΜΙΑ ΣΕΙΡΑ. Το `formGrid` κόβει κάθε στήλη σε
                  σταθερό μέγιστο: τρία πεδία των 220 με δύο κενά δεν χωρούσαν στα
                  672 του παραθύρου, οπότε το «Ισχύς από» έπεφτε μόνο του σε δεύτερη
                  σειρά, με δυόμισι στήλες κενές δεξιά του. */}
              <div {...fixedCols(3, 12, 'start')}>
                <div><div style={lbl}>Τρέχον μίσθωμα</div>{money(currentRent, setCurrentRent, '€')}</div>
                {method === 'manual'
                  ? <div><div style={lbl}>Νέο μίσθωμα</div>{money(newRentManual, setNewRentManual, '€')}</div>
                  : <div><div style={lbl}>{method === 'cpi' ? 'Μεταβολή ΔΤΚ' : 'Ποσοστό'}</div>{money(percent, setPercent, '%', PCT_MAX)}</div>}
                <div><div style={{ ...lbl, display: 'flex', alignItems: 'center', gap: 5 }}>Ισχύς από<InfoHint>Η ημερομηνία από την οποία εφαρμόζεται το νέο μίσθωμα. Κοινοποίησε την ειδοποίηση στον μισθωτή εγκαίρως, τηρώντας την προθεσμία που ορίζει το μισθωτήριο ή ο νόμος.</InfoHint></div><DatePicker value={effective} onChange={setEffective} /></div>
              </div>

              {/* ΤΟ ΑΠΟΤΕΛΕΣΜΑ, ΖΩΝΤΑΝΑ: Τρέχον → Νέο, και δίπλα η μεταβολή.
                  Οι τρεις ετικέτες ήταν γραμμένες τρεις φορές στο χέρι, με τα ίδια
                  πέντε γνωρίσματα αντιγραμμένα (μέγεθος, βάρος, letterSpacing,
                  uppercase, γραμματοσειρά) — δηλαδή τρεις ευκαιρίες να αποκλίνουν.
                  Τώρα είναι το `TT.label`, όπως κάθε άλλη ετικέτα της εφαρμογής.
                  Ουδέτερο μελάνι παντού, χρώμα μόνο όταν το μίσθωμα ΜΕΙΩΝΕΤΑΙ. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '13px 16px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card }}>
                <div>
                  <div style={TT.label}>Τρέχον</div>
                  <div style={{ ...TT.h2, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums', marginTop: 3 }}>{pEur(res.currentRent)}</div>
                </div>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                <div>
                  <div style={TT.label}>Νέο μίσθωμα</div>
                  <div style={{ ...TT.kpi, marginTop: 3 }}>{pEur(res.newRent)}</div>
                </div>
                <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                  <div style={TT.label}>Μεταβολή</div>
                  <div style={{ ...TT.body, fontWeight: 600, color: res.increase >= 0 ? 'var(--text-secondary)' : 'var(--negative)', fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>{pPct(res.pctApplied)} · {res.increase >= 0 ? '+' : ''}{pEur(res.increase)}</div>
                </div>
              </div>

              <div {...fixedCols(2, 12, 'start')}>
                <div><div style={lbl}>Εκμισθωτής (υπογράφων)</div><input value={ownerName} onChange={e => setOwnerName(e.target.value)} onFocus={onFieldFocus} onBlur={onFieldBlur} placeholder="Ονοματεπώνυμο ή επωνυμία" style={field} /></div>
                <div><div style={lbl}>Τόπος</div><input value={place} onChange={e => setPlace(e.target.value)} onFocus={onFieldFocus} onBlur={onFieldBlur} placeholder="Παράδειγμα: Αθήνα" style={field} /></div>
              </div>

              <div>
                <div style={{ ...lbl, display: 'flex', alignItems: 'center', gap: 5 }}>Ηλεκτρονική υπογραφή<InfoHint>Η υπογραφή ενσωματώνεται στο PDF και, μαζί με το QR, το καθιστά επαληθεύσιμο έγγραφο.</InfoHint></div>
                <SignaturePad onChange={setSig} height={92} />
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '11px 13px', borderRadius: T.radius.inner, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55, fontFamily: T.font.sans }}>
                  Ιδιωτική ειδοποίηση με ισχύ έγγραφης απόδειξης. Η <strong style={{ color: 'var(--text-primary)' }}>αλλαγή μισθώματος</strong> δηλώνεται επίσημα στη «Δήλωση Πληροφοριακών Στοιχείων Μίσθωσης» στο <a href={MYAADE} target="_blank" rel="noreferrer" title={aadeTitle('lease')} style={{ color: 'var(--accent)', textDecoration: 'none' }}>myAADE</a>.
                </div>
              </div>

              {err && <div style={{ fontSize: 13, color: 'var(--negative)', background: 'var(--negative-soft)', border: '1px solid var(--negative-border)', borderRadius: T.radius.inner, padding: '10px 14px' }}>{err}</div>}
            </>
          )}
      </>
    </Modal>
  );
}
