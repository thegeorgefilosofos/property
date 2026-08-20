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
import * as properties from '@/lib/data/properties';
import * as tenantStore from '@/lib/data/tenants';
// ΟΙ ΔΟΣΕΙΣ ΓΕΝΝΙΟΥΝΤΑΙ ΜΕ ΤΗ ΜΙΣΘΩΣΗ, ΟΧΙ ΟΤΑΝ ΤΙΣ ΚΟΙΤΑΞΕΙ ΚΑΝΕΙΣ.
import { syncInstalments } from './rentInstalments';
import type { Tenant } from './TabTenantTypes';
import { T, TT, Btn, Spinner, EmptyState, Modal, fp, fixedCols } from '@/components/Theme';
import { Building2 } from 'lucide-react';
import { InfoHint } from './InfoHint';
import { saved, savedData } from '@/components/dbWrite';

import { CustomSelect as Select, DatePicker } from './UIComponents';
import ScanButton from './ScanButton';
import SignaturePad from '@/components/SignaturePad';
import { grDate, todayIso, num, archivePdfToProperty } from './docUtils';
import { computeLease, leasePreamble, leaseTerms, type LeaseUse } from '@/lib/documents/lease';
import { issueDocument } from '@/lib/documents/issue';
import { generateReportPdf, reportPdfBlob, pEur, type PdfReportModel } from '@/lib/pdf/pdfReport';
import type { ReportBranding } from '@/lib/reportBranding';
import { MYAADE } from '@/lib/tax/aade';
import { aadeTitle } from '@/components/AadeLink';
import { failed } from '@/lib/core/dbError';
import { acceptNumeric, PCT_MAX } from '@/lib/core/numInput';

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

  // Φόρτωση ακινήτων και προσυμπλήρωση εκμισθωτή από το branding. Όλα τα setState
  // γίνονται στο callback (όχι στο σώμα του effect), ώστε να μην προκαλούνται
  // αλυσιδωτά renders.
  useEffect(() => {
    if (!open) return;
    properties.list<Prop>(supabase, userId, { columns: properties.LIST_COLUMNS, orderBy: 'name' })
      .then(ps => {
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
      // Η ΣΤΗΛΗ ΤΗΣ ΕΓΓΥΗΣΗΣ ΛΕΓΕΤΑΙ `deposit_amount`.
      // Ο πίνακας `tenants` έχει δύο: μια παλιά `deposit` που δεν διαβάζει
      // κανείς, και τη `deposit_amount` που χρησιμοποιεί ΟΛΗ η υπόλοιπη
      // εφαρμογή — η καρτέλα Ενοικιαστή, το πλακίδιο «Εγγύηση σε κατοχή», η
      // εξαγωγή, η σάρωση μισθωτηρίου, και η πύλη του ενοικιαστή.
      //
      // Αυτή η οθόνη ήταν η μόνη που χρησιμοποιούσε την παλιά, ΚΑΙ ΣΤΙΣ ΔΥΟ
      // ΚΑΤΕΥΘΥΝΣΕΙΣ. Άρα: το πεδίο «Εγγύηση» εμφανιζόταν πάντα κενό, παρότι ο
      // χρήστης το είχε ήδη καταχωρήσει· και ό,τι έγραφε εδώ εξαφανιζόταν από
      // παντού αλλού μόλις έκλεινε το παράθυρο. Χωρίς κανένα σφάλμα: η στήλη
      // υπάρχει, οπότε το γράψιμο πετύχαινε κανονικά.
      const t = await tenantStore.current<{ full_name?: string; afm?: string; monthly_rent?: number; deposit_amount?: number; lease_start?: string }>(
        supabase, propId, 'full_name,afm,monthly_rent,deposit_amount,lease_start', userId);
      if (!t) return;
      if (t.full_name) setTenant(p => p || t.full_name!);
      if (t.afm) setTenantAfm(p => p || String(t.afm));
      if (t.monthly_rent) setRent(p => p || String(t.monthly_rent));
      if (t.deposit_amount) setDeposit(p => p || String(t.deposit_amount));
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
        userId, docType: 'Ιδιωτικό συμφωνητικό μίσθωσης', // ΤΟ ΟΝΟΜΑ ΤΟΥ ΕΝΟΙΚΙΑΣΤΗ ΕΦΥΓΕ ΑΠΟ ΤΟ «ΑΝΤΙΚΕΙΜΕΝΟ».
        // Το πεδίο αυτό το επιστρέφει η ΔΗΜΟΣΙΑ σελίδα επαλήθευσης σε όποιον έχει
        // τον κωδικό του εγγράφου — και η ίδια σελίδα υπόσχεται ρητά ότι «δεν
        // εμφανίζονται ευαίσθητα στοιχεία». Για ένα μισθωτήριο, ονοματεπώνυμο
        // φυσικού προσώπου μαζί με τη διεύθυνση του ακινήτου είναι ακριβώς αυτό.
        // Το όνομα μένει στο ιδιωτικό `summary`, που δεν εκτίθεται ποτέ.
        subject: prop.name,
        period: `${grDate(res.start)} έως ${grDate(res.end)}`,
        summary: { rent: res.monthlyRent, deposit: res.deposit, months: res.months, use, tenant: tenant.trim() },
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
            ...(res.adjustmentPct > 0 ? [{ label: 'Ετήσια αναπροσαρμογή', value: fp(res.adjustmentPct) }] : []),
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
    } catch (e) { setErr(failed('Το μισθωτήριο δεν δημιουργήθηκε', e)); }
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
      const payload = { full_name: tenant.trim(), afm: tenantAfm.trim() || null, monthly_rent: res.monthlyRent, deposit_amount: res.deposit || null, lease_start: res.start, lease_end: res.end };
      const cur = await tenantStore.current<{ id: string }>(supabase, prop.id, 'id', userId);
      // Το try/catch από πάνω δεν καλύπτει αυτό: το Supabase δεν πετά. Χωρίς τον
      // έλεγχο, το συμφωνητικό αρχειοθετούνταν και ο ενοικιαστής δεν υπήρχε πουθενά.
      //
      // Η ΓΡΑΜΜΗ ΕΠΙΣΤΡΕΦΕΙ, ΓΙΑΤΙ ΑΠΟ ΑΥΤΗΝ ΓΕΝΝΙΟΥΝΤΑΙ ΤΑ ΧΡΗΜΑΤΑ. Χωρίς
      // αυτήν δεν ξέρουμε ούτε το αναγνωριστικό του νέου ενοικιαστή ούτε τη
      // συχνότητα πληρωμής, δηλαδή δεν μπορούν να δημιουργηθούν οι δόσεις — και
      // ένα υπογεγραμμένο μισθωτήριο θα άφηνε την ταμειακή θέση στο μηδέν.
      const row = await savedData('Ο ενοικιαστής δεν ενημερώθηκε από το συμφωνητικό', cur?.id
        ? tenantStore.updateReturning(supabase, cur.id, payload)
        : tenantStore.addReturning(supabase, prop.id, userId, payload));
      if (row) await syncInstalments(supabase, row as unknown as Tenant, prop.id, userId);

      setArchived(true);
      setTimeout(onClose, 1400);
    } catch { setErr('Η αρχειοθέτηση απέτυχε. Το PDF έχει ήδη κατέβει.'); }
    finally { setArchiving(false); }
  };

  // Ύψη από την κοινή κλίμακα, όχι literals. Το 40 του πεδίου ήταν η τιμή του
  // T.h.lg στο ποντίκι — αλλά ΜΟΝΟ εκεί: με δάχτυλο η κλίμακα ανεβαίνει στα 44
  // (globals.css, `@media (pointer: coarse)`) και το πεδίο έμενε στα 40. Το 34
  // του segmented control δεν ήταν καμία από τις τρεις τιμές (sm 32 / md 36 /
  // lg 40): το ΙΔΙΟ χειριστήριο ζει αυτούσιο και στο RentAdjustmentModal, όπου
  // ήδη διαβάζει T.h.md — δύο αντίγραφα, δύο ύψη, 34 εδώ και 36 εκεί.
  const field: React.CSSProperties = { height: T.h.lg, padding: '0 13px', borderRadius: T.radius.inner, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 14, fontFamily: T.font.sans, outline: 'none', boxSizing: 'border-box', width: '100%', transition: 'border-color 0.14s' };
  const lbl = { ...TT.label, marginBottom: 6 } as React.CSSProperties;
  const onF = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = 'var(--accent)'; };
  const onB = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = 'var(--border-default)'; };
  const seg = (u: LeaseUse): React.CSSProperties => ({ flex: 1, fontSize: 13, fontWeight: 600, height: T.h.md, borderRadius: T.radius.inner, cursor: 'pointer', textAlign: 'center', border: 'none', background: use === u ? 'var(--accent)' : 'transparent', color: use === u ? 'var(--accent-text)' : 'var(--text-secondary)', fontFamily: T.font.sans, transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s' });
  // ΤΟ ΦΙΛΤΡΟ ΔΕΝ ΕΙΝΑΙ ΚΑΛΛΩΠΙΣΜΟΣ. Το πεδίο δεχόταν «-500» και «12ε», και το
  // αποτέλεσμα έφτανε σε υπογεγραμμένο μισθωτήριο με QR επαλήθευσης: αρνητικό
  // μίσθωμα σε συμφωνητικό που υπογράφουν δύο μέρη. Όπου υπάρχει φυσικό
  // ανώτατο (ποσοστό 100, ημέρα μήνα 31) το λέμε ρητά (lib/core/numInput.ts).
  const money = (value: string, on: (v: string) => void, suffix: string, max?: number) => (
    <div style={{ position: 'relative' }}>
      <input value={value} onChange={e => { const v = acceptNumeric(e.target.value, max); if (v !== null) on(v); }}
        onFocus={onF} onBlur={onB} inputMode="decimal" placeholder=""
        style={{ ...field, paddingRight: 32, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} />
      {/* Ίδιο ύψος με το πεδίο, από την ΙΔΙΑ πηγή: αλλιώς το «€» δεν ακολουθεί
          το πεδίο όταν η κλίμακα ανεβαίνει στα 44 για το δάχτυλο. */}
      <span style={{ position: 'absolute', right: 13, top: 0, height: T.h.lg, display: 'flex', alignItems: 'center', color: 'var(--text-tertiary)', fontSize: 14, pointerEvents: 'none' }}>{suffix}</span>
    </div>
  );
  const stat = (label: string, value: string, strong = false) => (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>{label}</div>
      {/* Ήταν 13.5 — μισό εικονοστοιχείο, εκτός της κλίμακας μεγεθών. */}
      <div style={{ fontSize: strong ? 16 : 13, fontWeight: strong ? 700 : 600, color: strong ? 'var(--text-primary)' : 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums', marginTop: 3, fontFamily: T.font.sans }}>{value}</div>
    </div>
  );

  // ── ΤΟ ΠΑΡΑΘΥΡΟ ΕΓΙΝΕ <Modal> ────────────────────────────────────────────
  // Ίδιο χειρόγραφο κέλυφος με το RentAdjustmentModal, γραμμένο δεύτερη φορά —
  // και με τις ίδιες τρεις παραλείψεις: κανένα Escape, καμία εστίαση μέσα ή
  // επιστροφή μετά, καμία κλειδωμένη κύλιση φόντου. Σε αυτό εδώ το παράθυρο η
  // τελευταία μετράει διπλά: το σώμα έχει ΔΥΟ πίνακες υπογραφής (SignaturePad),
  // όπου το σύρσιμο του δαχτύλου δίπλα από τον καμβά κυλούσε τη σελίδα από πίσω.
  // Επίσης το «×» είχε padding 4 (στόχος ~21×30) και το maxHeight ήταν '92vh'.
  //
  // Το υποσέλιδο κρατά και τις δύο καταστάσεις: πριν τη δημιουργία «Ακύρωση» +
  // «Υπογεγραμμένο μισθωτήριο»· μετά (`pending`) η ερώτηση αρχειοθέτησης στο
  // footerInfo και τα τρία χειριστήρια απάντησης στο footer, όσο δεν έχει
  // αρχειοθετηθεί.
  //
  // ── ΟΣΟ ΓΡΑΦΕΙ, ΤΟ ΠΑΡΑΘΥΡΟ ΔΕΝ ΚΛΕΙΝΕΙ ─────────────────────────────────
  // Η μετατροπή ΠΡΟΣΘΕΤΕΙ έξοδο που δεν υπήρχε: το χειρόγραφο κέλυφος δεν
  // άκουγε πλήκτρα, άρα το Escape δεν έκανε τίποτα. Εδώ η αρχειοθέτηση κάνει
  // ΔΥΟ πράγματα — ανεβάζει το συμφωνητικό και γράφει την καρτέλα ενοικιαστή —
  // και το `saved()` της δεύτερης μιλά μέσα από ΑΥΤΟ το παράθυρο. Ένα Escape
  // στη μέση το κλείνει και το «Ο ενοικιαστής δεν ενημερώθηκε» δεν φτάνει
  // πουθενά: μένει αρχειοθετημένο μισθωτήριο χωρίς ενοικιαστή, σιωπηλά.
  // Πάνω στη δημιουργία, το ίδιο Escape σβήνει τη φόρμα ΜΑΖΙ ΜΕ ΤΙΣ ΔΥΟ
  // ΥΠΟΓΡΑΦΕΣ. Ίδια φρουρά με το Modal του PortfolioTab.
  const closeIfIdle = () => { if (busy || archiving) return; onClose(); };

  const footerInfo = pending ? (
    <span style={{ display: 'inline-block', minWidth: 220 }}>
      <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
        {archived ? 'Αποθηκεύτηκε και ενημερώθηκε ο ενοικιαστής.' : 'Να αποθηκευτεί στα έγγραφα του ακινήτου;'}
      </span>
      {!archived && <span style={{ display: 'block', fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>Αρχειοθετείται με ημερομηνία έναρξης {grDate(res.start)} και ενημερώνει την καρτέλα ενοικιαστή.</span>}
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
      <Btn variant="primary" onClick={generate} disabled={busy || !ready}>{busy ? 'Δημιουργία…' : 'Υπογεγραμμένο μισθωτήριο'}</Btn>
    </>
  );

  return (
    <Modal open={open} onClose={closeIfIdle} width={760}
      ariaLabel="Σύνταξη μισθωτηρίου"
      title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>Μισθωτήριο<InfoHint>Το PDF βγαίνει με αριθμό εγγράφου και QR επαλήθευσης, αρχειοθετείται στα έγγραφα του ακινήτου και ενημερώνει την καρτέλα ενοικιαστή.</InfoHint></span>}
      subtitle="Ιδιωτικό συμφωνητικό με υπογραφή και των δύο μερών"
      icon={<svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h4" /></svg>}
      footer={footer} footerInfo={footerInfo}>
      <>
          {loading ? <Spinner size={18} label="Φόρτωση…" /> : props.length === 0 ? <EmptyState icon={<Building2 size={20} />} title="Κανένα ακίνητο ακόμη" hint="Πρόσθεσε ακίνητο για να συντάξεις μισθωτήριο." /> : (
            <>
              <ScanButton onExtract={doc => {
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
                  <div style={{ display: 'flex', gap: 3, padding: 3, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner }}>
                    <button onClick={() => setUse('residence')} style={seg('residence')}>Κατοικία</button>
                    <button onClick={() => setUse('professional')} style={seg('professional')}>Επαγγελματική</button>
                  </div>
                </div>
              </div>

              <div {...fixedCols(2, 12, 'start')}>
                <div><div style={lbl}>Εκμισθωτής</div><input value={landlord} onChange={e => setLandlord(e.target.value)} onFocus={onF} onBlur={onB} placeholder="Ονοματεπώνυμο ή επωνυμία" style={field} /></div>
                <div><div style={lbl}>ΑΦΜ εκμισθωτή</div><input value={landlordAfm} onChange={e => setLandlordAfm(e.target.value)} onFocus={onF} onBlur={onB} placeholder="Προαιρετικό" inputMode="numeric" style={field} /></div>
                <div><div style={lbl}>Μισθωτής</div><input value={tenant} onChange={e => setTenant(e.target.value)} onFocus={onF} onBlur={onB} placeholder="Ονοματεπώνυμο" style={field} /></div>
                <div><div style={lbl}>ΑΦΜ μισθωτή</div><input value={tenantAfm} onChange={e => setTenantAfm(e.target.value)} onFocus={onF} onBlur={onB} placeholder="Προαιρετικό" inputMode="numeric" style={field} /></div>
              </div>

              <div {...fixedCols(3, 12, 'start')}>
                <div><div style={lbl}>Μηνιαίο μίσθωμα</div>{money(rent, setRent, '€')}</div>
                <div><div style={{ ...lbl, display: 'flex', alignItems: 'center', gap: 5 }}>Εγγύηση<InfoHint>Συνήθως ένα ή δύο μισθώματα. Δεν συμψηφίζεται με μισθώματα και επιστρέφεται ατόκως στη λήξη, εφόσον δεν υπάρχουν φθορές ή οφειλές.</InfoHint></div>{money(deposit, setDeposit, '€')}</div>
                <div><div style={lbl}>Έναρξη</div><DatePicker value={start} onChange={setStart} /></div>
                <div><div style={{ ...lbl, display: 'flex', alignItems: 'center', gap: 5 }}>Διάρκεια<InfoHint>Στις μισθώσεις κατοικίας ισχύει η κατά νόμο ελάχιστη τριετής διάρκεια, ακόμη και αν συμφωνηθεί μικρότερη.</InfoHint></div>{money(years, setYears, 'έτη')}</div>
                <div><div style={lbl}>Αναπροσαρμογή</div>{money(adjust, setAdjust, '%', PCT_MAX)}</div>
                <div><div style={lbl}>Ημέρα πληρωμής</div>{money(payDay, setPayDay, 'ημ.', 31)}</div>
              </div>

              {/* Σύνοψη διάρκειας — ουδέτερη, με προειδοποίηση μόνο όπου έχει νόημα */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '13px 16px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card }}>
                {stat('Έναρξη', grDate(res.start))}
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                {stat('Λήξη', grDate(res.end), true)}
                {stat('Διάρκεια', `${res.months} μήνες`)}
                <div style={{ marginLeft: 'auto' }}>{stat('Δήλωση έως', grDate(res.declarationDeadline))}</div>
              </div>
              {res.belowLegalMinimum && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '11px 13px', borderRadius: T.radius.inner, background: 'var(--warning-soft)', border: '1px solid var(--warning-border)' }}>
                  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55, fontFamily: T.font.sans }}>Στην κατοικία ισχύει η <strong style={{ color: 'var(--text-primary)' }}>ελάχιστη τριετής διάρκεια</strong> κατά νόμο, ακόμη και με μικρότερη συμφωνία.</div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 14 }}>
                <div>
                  <div style={{ ...lbl, display: 'flex', alignItems: 'center', gap: 5 }}>Υπογραφή εκμισθωτή<InfoHint>Η υπογραφή ενσωματώνεται στο PDF και, μαζί με το QR, το καθιστά επαληθεύσιμο.</InfoHint></div>
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

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '11px 13px', borderRadius: T.radius.inner, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55, fontFamily: T.font.sans }}>
                  Μετά την υπογραφή, υπόβαλε τη <strong style={{ color: 'var(--text-primary)' }}>Δήλωση Πληροφοριακών Στοιχείων Μίσθωσης</strong> στο <a href={MYAADE} target="_blank" rel="noreferrer" title={aadeTitle('lease')} style={{ color: 'var(--accent)', textDecoration: 'none' }}>myAADE</a>, έως {grDate(res.declarationDeadline)}.
                </div>
              </div>

              {err && <div style={{ fontSize: 13, color: 'var(--negative)', background: 'var(--negative-soft)', border: '1px solid var(--negative-border)', borderRadius: T.radius.inner, padding: '10px 14px' }}>{err}</div>}
            </>
          )}
      </>
    </Modal>
  );
}
