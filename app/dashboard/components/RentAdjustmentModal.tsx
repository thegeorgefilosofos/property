'use client';

// ═══════════════════════════════════════════════════════════════════════════
// RentAdjustmentModal — Ειδοποίηση αναπροσαρμογής μισθώματος με e-signature (P3.2).
// Επιλογή ακινήτου/μισθωτή, τρέχον μίσθωμα, μέθοδος (ποσοστό/ΔΤΚ/χειροκίνητο),
// ημερομηνία ισχύος, ηλεκτρονική υπογραφή εκμισθωτή → επίσημο, επαληθεύσιμο
// true-PDF με ενσωματωμένη υπογραφή (lib/pdf/pdfReport section 'sign').
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as properties from '@/lib/data/properties';
import * as tenantStore from '@/lib/data/tenants';
import { saved } from '@/components/dbWrite';
import { T, TT, Btn, Spinner, EmptyState, Modal, fixedCols } from '@/components/Theme';
import { Building2 } from 'lucide-react';
import { InfoHint } from './InfoHint';

import { CustomSelect as Select, DatePicker } from './UIComponents';
import ScanButton from './ScanButton';
import SignaturePad from '@/components/SignaturePad';
import { grDate, todayIso, num, archivePdfToProperty } from './docUtils';
import { fn } from '@/lib/core/format';
import { computeRentAdjustment, adjustmentNoticeText, type AdjMethod } from '@/lib/documents/rentAdjustment';
import { issueDocument } from '@/lib/documents/issue';
import { generateReportPdf, reportPdfBlob, pEur, pPct, type PdfReportModel } from '@/lib/pdf/pdfReport';
import type { ReportBranding } from '@/lib/reportBranding';
import { MYAADE } from '@/lib/tax/aade';
import { aadeTitle } from '@/components/AadeLink';
import { SAY, failed } from '@/lib/core/dbError';
import { acceptNumeric, PCT_MAX } from '@/lib/core/numInput';
import { rentIndexFor, rentAdjustmentPct, indexMonthLabel, indexPeriodLabel, CPI_SOURCE_URL, cpiConfirmedDate } from '@/lib/market/cpi';

interface Prop { id: string; name: string; address: string | null }

/**
 * Η εγγραφή του μητρώου για μια ειδοποίηση που έχει ήδη εκδοθεί.
 *
 * Το `summary` το γράφει το ίδιο αυτό παράθυρο (βλέπε `issueDocument` πιο κάτω),
 * οπότε τα πεδία είναι γνωστά. Γράφονται προαιρετικά γιατί έρχονται από JSON
 * της βάσης: μια παλιά γραμμή μπορεί να μην τα έχει όλα.
 */
type PriorNotice = {
  id: string;
  issued_at: string;
  period: string | null;
  summary: { currentRent?: number; newRent?: number; pct?: number; tenant?: string } | null;
};

export default function RentAdjustmentModal({ open, onClose, userId, supabase, branding }: {
  open: boolean; onClose: () => void; userId: string; supabase: SupabaseClient; branding?: ReportBranding | null;
}) {
  const [props, setProps] = useState<Prop[]>([]);
  const [propId, setPropId] = useState('');
  const [tenant, setTenant] = useState('');
  // Το αναγνωριστικό της γραμμής `tenants` που θα πάρει το νέο μίσθωμα. Το
  // όνομα από πάνω είναι επεξεργάσιμο κείμενο για το έγγραφο, δεν δείχνει
  // γραμμή· χωρίς το id η εγγραφή δεν έχει πού να πάει.
  const [tenantId, setTenantId] = useState('');
  const [currentRent, setCurrentRent] = useState('');
  // Γράφτηκε όντως το νέο μίσθωμα; Κρατιέται από την επιστροφή της `saved`,
  // ώστε το υποσέλιδο να μην ανακοινώνει εγγραφή που απέτυχε ή δεν έγινε.
  const [rentSaved, setRentSaved] = useState(false);
  const [method, setMethod] = useState<AdjMethod>('percent');
  const [percent, setPercent] = useState('');
  // ═══ Ο ΔΤΚ ΔΕΝ ΕΙΝΑΙ ΠΕΔΙΟ, ΕΙΝΑΙ ΔΕΔΟΜΕΝΟ ══════════════════════════════════
  //
  // ΤΟ ΠΡΩΤΟ ΠΡΟΒΛΗΜΑ. Ο χρήστης πατούσε «ΔΤΚ (ΕΛΣΤΑΤ)» και έβρισκε ΑΔΕΙΟ πεδίο
  // με προτροπή «βάλε την ετήσια μεταβολή»: του ζητούσαμε κρατικό στοιχείο που
  // δεν το ξέρει απ' έξω κανείς, τη στιγμή που ετοιμάζει υπογεγραμμένη
  // ειδοποίηση προς τον μισθωτή του.
  //
  // ΤΟ ΔΕΥΤΕΡΟ, ΚΑΙ ΣΟΒΑΡΟΤΕΡΟ. Ακόμη και συμπληρωμένο, το νούμερο ήταν ΛΑΘΟΣ
  // ΜΕΤΡΟ: η μέση ετήσια μεταβολή ενός ημερολογιακού έτους. Ο νόμος ορίζει την
  // ΑΠΛΗ ΔΩΔΕΚΑΜΗΝΗ ΜΕΤΑΒΟΛΗ, που αλλάζει κάθε μήνα και εξαρτάται από τον μήνα
  // ισχύος: Φεβρουάριος 2026 δίνει 2,50% και Ιούλιος 2026 δίνει 4,40%.
  //
  // ΓΙ' ΑΥΤΟ ΔΕΝ ΥΠΑΡΧΕΙ ΠΙΑ ΚΑΤΑΣΤΑΣΗ ΓΙΑ ΤΟΝ ΔΤΚ. Το ποσοστό ΠΑΡΑΓΕΤΑΙ από
  // την ημερομηνία ισχύος και από τη βάση που λέει η σύμβαση· κατάσταση που
  // αντιγράφει παραγόμενη τιμή είναι κατάσταση που θα ξεμείνει και εδώ θα
  // ξέμενε πάνω σε έγγραφο με υπογραφή.
  //
  // ΤΟ 75% ΤΟ ΛΕΕΙ Η ΣΥΜΒΑΣΗ, ΟΧΙ ΕΜΕΙΣ. Ο νόμος δίνει δύο βάσεις: ολόκληρη τη
  // δωδεκάμηνη μεταβολή ή το 75% της (τυπικό στις επαγγελματικές μισθώσεις).
  // Η οθόνη ρωτά με έναν διακόπτη δύο θέσεων και δεν μαντεύει.
  const [cpiShare75, setCpiShare75] = useState(false);
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
  // Η προηγούμενη ειδοποίηση του ίδιου ακινήτου, όπως την κρατά το μητρώο.
  const [prior, setPrior] = useState<PriorNotice | null>(null);
  // Ρητή επιβεβαίωση όταν υπάρχει ήδη ειδοποίηση για την ίδια περίοδο ισχύος.
  const [priorAck, setPriorAck] = useState(false);
  // Το μητρώο δεν απάντησε. Δεν ξέρουμε αν υπάρχει προηγούμενη ειδοποίηση.
  const [priorUnknown, setPriorUnknown] = useState(false);
  /** Για ποιο ακίνητο ισχύουν τα δύο από πάνω. Βλέπε το σχόλιο στο effect. */
  const [priorFor, setPriorFor] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [archived, setArchived] = useState(false);

  // Η ΣΗΜΑΙΑ ΦΟΡΤΩΣΗΣ ΜΠΑΙΝΕΙ ΜΕΣΑ ΣΤΗΝ ΑΛΥΣΙΔΑ, ΟΧΙ ΠΡΙΝ ΑΠΟ ΑΥΤΗΝ. Γραμμένη
  // στο σώμα του effect, προκαλεί δεύτερη απόδοση ΠΡΙΝ καν ξεκινήσει το αίτημα.
  // Μέσα στην ασύγχρονη συνάρτηση κάνει την ίδια δουλειά, χωρίς την επιπλέον
  // απόδοση και σταματά να ενοχλεί τον κανόνα set-state-in-effect.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const ps = await properties.list<Prop>(supabase, userId, { orderBy: 'name' });
      if (!alive) return;
      setProps(ps); setPropId(prev => prev || ps[0]?.id || ''); setLoading(false);
      if (branding?.companyName) setOwnerName(prev => prev || branding.companyName);
    })();
    return () => { alive = false; };
  }, [open, userId, supabase, branding?.companyName]);

  // Prefill μισθωτή + τρέχοντος μισθώματος από την καρτέλα του μισθωτή.
  //
  // ΤΟ ΠΟΣΟ ΤΗΣ ΤΕΛΕΥΤΑΙΑΣ ΔΟΣΗΣ ΔΕΝ ΕΙΝΑΙ ΤΟ ΜΗΝΙΑΙΟ ΜΙΣΘΩΜΑ. Το πεδίο γέμιζε
  // από `rentStore.latestAmount`, δηλαδή από τη στήλη `amount` της νεότερης
  // γραμμής `rent_payments`. Εκείνη γράφεται ως (μίσθωμα + υπηρεσίες) επί τους
  // μήνες της δόσης (TabTenantMoney.tsx:398). Με τριμηνιαία εξόφληση 500,00 €
  // τον μήνα, η οθόνη έγραφε «Τρέχον 1.500,00 €» και το υπογεγραμμένο PDF
  // ειδοποιούσε τον μισθωτή για τριπλάσιο μίσθωμα· με χρέωση υπηρεσιών, το
  // ίδιο έγγραφο ανέβαζε τις υπηρεσίες μαζί με το μίσθωμα.
  //
  // Η πηγή είναι το `tenants.monthly_rent`, το ίδιο πεδίο που διαβάζει και
  // γράφει το LeaseModal. Μαζί κρατιέται το `id` της γραμμής, γιατί εκεί
  // γράφεται το νέο μίσθωμα μόλις εκδοθεί η ειδοποίηση.
  useEffect(() => {
    if (!open || !propId) return;
    (async () => {
      const t = await tenantStore.current<{ id: string; full_name: string | null; monthly_rent: number | null }>(
        supabase, propId, 'id,full_name,monthly_rent', userId);
      setTenantId(t?.id || '');
      if (t?.full_name) setTenant(t.full_name);
      if (t?.monthly_rent) setCurrentRent(String(t.monthly_rent));
    })();
  }, [open, propId, userId, supabase]);


  const prop = props.find(p => p.id === propId);

  // ═══ Η ΔΕΥΤΕΡΗ ΕΠΙΣΤΟΛΗ ΠΑΤΑΕΙ ΠΑΝΩ ΣΤΗΝ ΠΡΩΤΗ, ΚΑΙ ΤΗΝ ΑΝΕΒΑΖΕΙ ΞΑΝΑ ══════
  // ΤΟ ΣΕΝΑΡΙΟ, ΒΗΜΑ ΒΗΜΑ. Ο ιδιοκτήτης εκδίδει ειδοποίηση 600,00 € προς
  // 626,40 € με ισχύ σήμερα. Το παράθυρο γράφει το νέο μίσθωμα στην καρτέλα του
  // μισθωτή, όπως πρέπει. Την επόμενη μέρα ξανανοίγει το ίδιο παράθυρο, για να
  // δει τι είχε κάνει ή επειδή δεν είναι σίγουρος ότι κατέβηκε το PDF. Το
  // «Τρέχον μίσθωμα» προσυμπληρώνεται ΤΩΡΑ με 626,40 €, γιατί αυτό λέει η
  // καρτέλα. Πατά «Υπογεγραμμένο PDF» και παίρνει δεύτερη επίσημη ειδοποίηση,
  // 626,40 € προς 653,96 €, με τον ΙΔΙΟ δείκτη του ΙΔΙΟΥ μήνα.
  //
  // ΤΙ ΜΕΝΕΙ ΜΕΤΑ. Δύο αριθμημένα έγγραφα στο μητρώο για την ίδια αναπροσαρμογή,
  // ο μισθωτής με το πρώτο στο χέρι, η καρτέλα με το ποσό του δεύτερου· και μια
  // αύξηση διπλάσια από αυτήν που επιτρέπει ο δείκτης. Κανένα σφάλμα, καμία
  // προειδοποίηση: κάθε βήμα ήταν νόμιμο μόνο του.
  //
  // Ο ΕΛΕΓΧΟΣ ΔΕΝ ΑΠΑΓΟΡΕΥΕΙ, ΛΕΕΙ. Δεύτερη ειδοποίηση στην ίδια περίοδο είναι
  // θεμιτή (διόρθωση ονόματος, λάθος ημερομηνία, νέο μισθωτήριο). Αυτό που δεν
  // είναι θεμιτό είναι να γίνει ΚΑΤΑ ΛΑΘΟΣ. Οπότε φαίνεται τι έχει ήδη εκδοθεί,
  // με ημερομηνία και ποσά· και ζητείται ρητή επιβεβαίωση.
  useEffect(() => {
    if (!open || !propId || !prop) return;
    (async () => {
      // ΤΟ «ΔΕΝ ΞΕΡΩ» ΔΕΝ ΕΠΙΤΡΕΠΕΤΑΙ ΝΑ ΔΙΑΒΑΖΕΤΑΙ ΩΣ «ΔΕΝ ΥΠΑΡΧΕΙ». Μια
      // ανάγνωση που αγνοεί το `error` γυρίζει άδειο πίνακα και όταν αποτύχει:
      // εδώ αυτό θα σήμαινε «καμία προηγούμενη ειδοποίηση», δηλαδή ο έλεγχος θα
      // σιωπούσε ακριβώς όταν δεν μπορεί να απαντήσει. Η άγνοια είναι λόγος για
      // ΠΕΡΙΣΣΟΤΕΡΗ προσοχή, όχι για λιγότερη.
      const { data, error } = await supabase.from('issued_documents')
        .select('id,issued_at,period,summary')
        .eq('user_id', userId).eq('doc_type', 'Ειδοποίηση αναπροσαρμογής μισθώματος')
        .eq('subject', prop.name || '')
        .order('issued_at', { ascending: false }).limit(1);
      setPriorUnknown(!!error);
      const row = (data || [])[0] as PriorNotice | undefined;
      setPrior(row || null);
      // ΤΟ ΚΛΕΙΔΙ ΑΝΤΙ ΓΙΑ ΜΗΔΕΝΙΣΜΟ. Ο μηδενισμός στην αρχή του effect είναι
      // σύγχρονη γραφή κατάστασης μέσα σε effect, δηλαδή δεύτερη απόδοση σε κάθε
      // άνοιγμα. Με κλειδί, το «για ποιο ακίνητο ισχύει αυτό που διάβασα»
      // απαντιέται από τα ίδια τα δεδομένα: αλλάζοντας ακίνητο, το παλιό
      // αποτέλεσμα παύει να ταιριάζει και δεν λαμβάνεται υπόψη.
      setPriorFor(propId);
    })();
  }, [open, propId, prop, userId, supabase]);

  // Ο δείκτης που εφαρμόζεται σε αναπροσαρμογή με ισχύ αυτόν τον μήνα. Η ΕΛΣΤΑΤ
  // ανακοινώνει με καθυστέρηση, οπότε ισχύς τον Αύγουστο στηρίζεται στον
  // δημοσιευμένο δείκτη του Ιουλίου — και η οθόνη γράφει ποιον διάλεξε.
  // ΙΔΙΑ ΠΕΡΙΟΔΟΣ ΣΗΜΑΙΝΕΙ ΙΔΙΟΣ ΜΗΝΑΣ ΙΣΧΥΟΣ. Το `period` γράφεται από εδώ ως
  // «Ισχύς από <ημερομηνία>»· κρατιέται ο μήνας, γιατί δύο ειδοποιήσεις με ισχύ
  // 01/09 και 15/09 είναι η ίδια αναπροσαρμογή γραμμένη δύο φορές.
  const priorReady = priorFor === propId;
  const priorSameMonth = priorReady && prior && (prior.period || '').includes(grDate(effective).slice(3))
    ? prior : null;
  const blockedByPrior = (!!priorSameMonth || (priorReady && priorUnknown)) && !priorAck;

  const index = rentIndexFor(effective.slice(0, 7));
  const cpiPct = index ? rentAdjustmentPct(index.pct, cpiShare75) : null;
  // ΧΩΡΙΣ useMemo, ΕΠΙΤΗΔΕΣ. Ο υπολογισμός είναι τέσσερις πράξεις πάνω σε
  // αριθμούς· το `useMemo` δεν γλίτωνε τίποτα και, με το `cpiPct` να παράγεται
  // πλέον μέσα στην ίδια απόδοση, εμπόδιζε τον μεταγλωττιστή του React να
  // βελτιστοποιήσει ΟΛΟΚΛΗΡΟ το component. Η αυτόματη απομνημόνευση κάνει
  // καλύτερη δουλειά από τη χειροκίνητη εδώ.
  const res = computeRentAdjustment({ currentRent: num(currentRent), method, percent: num(percent), cpiPct: cpiPct ?? 0, newRentManual: num(newRentManual) });

  if (!open) return null;

  const generate = async () => {
    setErr('');
    if (!prop) { setErr('Διάλεξε ακίνητο.'); return; }
    if (num(currentRent) <= 0) { setErr('Συμπλήρωσε το τρέχον μίσθωμα.'); return; }
    // Χωρίς δημοσιευμένο δείκτη, η ειδοποίηση θα έγραφε «βάσει της μεταβολής του
    // ΔΤΚ» με μηδέν δίπλα. Καλύτερα να μη βγει έγγραφο παρά να βγει ψεύτικο.
    if (method === 'cpi' && cpiPct == null) { setErr('Για τον μήνα ισχύος δεν υπάρχει δημοσιευμένος δείκτης ΕΛΣΤΑΤ.'); return; }
    if (!sig) { setErr('Υπόγραψε το έγγραφο.'); return; }
    // Ο ίδιος όρος με το κουμπί, γραμμένος και εδώ: ένα disabled κουμπί δεν
    // είναι έλεγχος, είναι ένδειξη. Το πληκτρολόγιο και η επαναφορά της οθόνης
    // το προσπερνούν.
    if (blockedByPrior) { setErr('Υπάρχει ήδη ειδοποίηση για αυτόν τον μήνα ισχύος. Επιβεβαίωσε πιο πάνω ότι θέλεις δεύτερη.'); return; }
    setBusy(true);
    try {
      const notice = adjustmentNoticeText({ tenantName: tenant.trim() || undefined, address: prop.address || undefined, effectiveDate: grDate(effective), method, res, cpiPeriod: index ? indexPeriodLabel(index.ym) : undefined, cpiShare75 });
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
            { label: method === 'cpi' && index ? `Μεταβολή ΔΤΚ, ${indexPeriodLabel(index.ym)}` : 'Μεταβολή', value: pPct(res.pctApplied) },
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
      // ΤΟ ΕΓΓΡΑΦΟ ΕΒΓΑΙΝΕ ΚΑΙ ΤΟ ΜΙΣΘΩΜΑ ΕΜΕΝΕ ΤΟ ΠΑΛΙΟ. Οι μόνες εγγραφές του
      // παραθύρου ήταν το `issued_documents` και το αρχείο του PDF· καμία στην
      // καρτέλα του μισθωτή. Με ειδοποίηση 600,00 € προς 626,40 €, η δόση
      // Σεπτεμβρίου γεννιόταν στα 600,00 € και το ίδιο ποσό περνούσε σε αίτημα
      // πληρωμής, πύλη μισθωτή και Ε2.
      //
      // ΕΔΩ ΚΑΙ ΟΧΙ ΣΤΟ archive(). Η αρχειοθέτηση είναι προαιρετική («Ίσως
      // αργότερα»), οπότε εκεί το μισό κοινό θα έφευγε πάλι με παλιό μίσθωμα.
      // Σε αυτό το σημείο το PDF έχει ήδη υπογραφεί, εκδοθεί και κατέβει.
      //
      // Η ΗΜΕΡΟΜΗΝΙΑ ΙΣΧΥΟΣ ΤΗΡΕΙΤΑΙ. Το ποσό γραφόταν αμέσως, όποια κι αν ήταν
      // η «Ισχύς από»: ειδοποίηση υπογεγραμμένη τον Αύγουστο με ισχύ 01/01/2027
      // ανέβαζε το μίσθωμα του Αυγούστου και ο μισθωτής έβλεπε στην πύλη του
      // ποσό διαφορετικό από αυτό που του κοινοποιήθηκε εγγράφως.
      //
      // Μελλοντική ισχύς γίνεται ΡΑΝΤΕΒΟΥ (pending_rent / pending_rent_from) και
      // το τηρεί η νυχτερινή `apply_due_rent_adjustments`. Ισχύς σήμερα ή
      // παλαιότερη γράφεται κατευθείαν και το τυχόν παλιό ραντεβού ακυρώνεται:
      // δεύτερη ειδοποίηση αντικαθιστά την πρώτη, δεν στοιβάζεται πάνω της.
      //
      // Οι ήδη δημιουργημένες απλήρωτες δόσεις δεν ξαναγράφονται από εδώ:
      // γίνονται «ξεπερασμένες» και τις πιάνει το κουμπί συγχρονισμού της
      // καρτέλας Χρήματα.
      if (tenantId) {
        const patch = effective > todayIso()
          ? { pending_rent: res.newRent, pending_rent_from: effective }
          : { monthly_rent: res.newRent, pending_rent: null, pending_rent_from: null };
        setRentSaved(await saved('Το νέο μίσθωμα δεν αποθηκεύτηκε στην καρτέλα του μισθωτή',
          tenantStore.update(supabase, tenantId, patch)));
      }
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
    } catch { setErr(SAY.archiveFailed); }
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
  // ΤΟ ΔΙΑΚΡΙΤΙΚΟ ΠΟΥ ΛΕΕΙ ΑΠΟ ΠΟΥ ΗΡΘΕ Ο ΑΡΙΘΜΟΣ, ΓΙΑ ΠΟΙΑ ΠΕΡΙΟΔΟ ΚΑΙ ΠΟΤΕ
  // ΕΝΗΜΕΡΩΘΗΚΕ. Ένα πεδίο που γεμίζει μόνο του χωρίς να πει από πού, σε έγγραφο
  // που θα υπογραφεί, είναι χειρότερο από άδειο πεδίο: ο χρήστης δεν ξέρει τι
  // υπογράφει. Η προτροπή «βάλε την ετήσια μεταβολή» έφυγε — δεν βάζει τίποτα.
  const METHOD_HINT: Record<AdjMethod, React.ReactNode> = {
    percent: 'Σταθερό ποσοστό αύξησης, όπως το συμφωνήσατε στο μισθωτήριο.',
    cpi: !index
      ? 'Για τον μήνα που διάλεξες δεν υπάρχει δημοσιευμένος δείκτης. Διάλεξε μεταγενέστερη ημερομηνία ισχύος, ή όρισε το ποσοστό της σύμβασης με τη μέθοδο «Ποσοστό».'
      : <>
          Δωδεκάμηνη μεταβολή {indexPeriodLabel(index.ym)}, όπως τη δημοσίευσε η ΕΛΣΤΑΤ για τον{' '}
          {indexMonthLabel(index.ym)}. Τελευταία ενημέρωση {cpiConfirmedDate()}.{' '}
          <a href={CPI_SOURCE_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>Έλεγχος στην πηγή</a>
        </>,
    manual: 'Όρισε απευθείας το νέο μίσθωμα, όπως το συμφωνήσατε.',
  };
  // Ίδιο σχήμα με τον επιλογέα μεθόδου, ώστε οι δύο σειρές να διαβάζονται ως
  // ερώτηση και υποερώτηση και όχι ως δύο άσχετα χειριστήρια.
  const share = (on: boolean): React.CSSProperties => ({ ...seg('cpi'), background: cpiShare75 === on ? 'var(--accent)' : 'transparent', color: cpiShare75 === on ? 'var(--accent-text)' : 'var(--text-secondary)' });

  // ΤΟ ΠΟΣΟΣΤΟ ΤΟΥ ΔΤΚ ΔΕΝ ΠΛΗΚΤΡΟΛΟΓΕΙΤΑΙ. Είναι κρατικό στοιχείο: αν το άφηνε
  // κανείς επεξεργάσιμο, το έγγραφο θα μπορούσε να γράφει «βάσει της μεταβολής
  // του ΔΤΚ» δίπλα σε νούμερο που δεν είναι η μεταβολή του ΔΤΚ. Το κουτί κρατά
  // το σχήμα των διπλανών πεδίων ώστε η σειρά να μένει ομοιόμορφη, αλλά δείχνει
  // ότι δεν δέχεται πληκτρολόγηση.
  const readOnlyPct = (v: number | null) => (
    <div style={{ ...field, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, background: 'var(--bg-elevated)', color: v == null ? 'var(--text-tertiary)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', cursor: 'default' }}>
      {v == null ? 'Χωρίς δείκτη' : <>{fn(v, 2)}<span style={{ color: 'var(--text-tertiary)' }}>%</span></>}
    </div>
  );

  // Πεδίο ποσού με διακριτικό σύμβολο (€ ή %) στη δεξιά άκρη, αριθμοί δεξιά.
  //
  // ΤΟ ΦΙΛΤΡΟ ΔΕΝ ΕΙΝΑΙ ΚΑΛΛΩΠΙΣΜΟΣ. Το πεδίο δεχόταν «-500» και «12ε» και το
  // αποτέλεσμα έφτανε σε υπογεγραμμένο PDF με QR επαλήθευσης: αρνητικό μίσθωμα
  // σε επίσημη ειδοποίηση προς τον μισθωτή. Το ποσοστό δέχεται έως 100, γιατί
  // πάνω από αυτό δεν είναι ποσοστό (lib/core/numInput.ts).
  // Το όνομα είναι όρισμα: η ετικέτα ζει σε διπλανό <div> και δεν φτάνει ποτέ
  // στο πεδίο. Τρεις κλήσεις, τρία διαφορετικά νοήματα.
  const money = (value: string, on: (v: string) => void, suffix: string, name: string, max?: number) => (
    <div style={{ position: 'relative' }}>
      <input value={value} aria-label={name} onChange={e => { const v = acceptNumeric(e.target.value, max); if (v !== null) on(v); }}
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
  // Escape δεν έκλεινε, η εστίαση δεν έμπαινε μέσα ούτε γύριζε πίσω και το
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
        {archived ? 'Αποθηκεύτηκε στα έγγραφα του ακινήτου.' : SAY.archiveAsk}
      </span>
      {/* Η ΣΙΩΠΗΛΗ ΕΓΓΡΑΦΗ ΣΕ ΧΡΗΜΑΤΙΚΟ ΠΕΔΙΟ ΛΕΓΕΤΑΙ. Η γραμμή βγαίνει μόνο
          όταν το γράψιμο πέτυχε: χωρίς καρτέλα μισθωτή, ή με αποτυχία που την
          ανακοίνωσε ήδη η `saved`, δεν υπάρχει τίποτα να ανακοινωθεί εδώ. */}
      {rentSaved && <span style={{ display: 'block', fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>{effective > todayIso()
        ? `Το μίσθωμα γίνεται ${pEur(res.newRent)} στην καρτέλα του μισθωτή την ${grDate(effective)}. Μέχρι τότε μένει ${pEur(res.currentRent)}.`
        : `Το μηνιαίο μίσθωμα ενημερώθηκε σε ${pEur(res.newRent)} στην καρτέλα του μισθωτή.`}</span>}
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
      <Btn variant="primary" onClick={generate} disabled={busy || !sig || num(currentRent) <= 0 || blockedByPrior}>{busy ? 'Δημιουργία…' : 'Υπογεγραμμένο PDF'}</Btn>
    </>
  );

  // ΤΟ ⓘ ΤΟΥ ΤΙΤΛΟΥ ΕΛΕΓΕ ΤΟΝ ΥΠΟΤΙΤΛΟ, ΜΕ ΠΕΡΙΣΣΟΤΕΡΕΣ ΛΕΞΕΙΣ. «Επίσημη έγγραφη
  // ειδοποίηση προς τον μισθωτή … υπογράφεις ηλεκτρονικά … επαλήθευση» — και από
  // κάτω, ορατός χωρίς πάτημα: «Επίσημη ειδοποίηση προς τον μισθωτή, με
  // ηλεκτρονική υπογραφή και επαλήθευση». Έμεινε αυτός που φαίνεται.
  return (
    <Modal open={open} onClose={closeIfIdle} size="lg"
      ariaLabel="Δήλωση αναπροσαρμογής"
      title="Αναπροσαρμογή ενοικίου"
      subtitle="Επίσημη ειδοποίηση προς τον μισθωτή, με ηλεκτρονική υπογραφή και επαλήθευση"
      icon={<svg aria-hidden="true" width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>}
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
                <div><div style={lbl}>Ακίνητο</div><Select ariaLabel="Ακίνητο" value={propId} onChange={setPropId} options={props.map(p => ({ value: p.id, label: p.name }))} placeholder="Επιλογή ακινήτου" /></div>
                <div><div style={lbl}>Μισθωτής</div><input aria-label="Ονοματεπώνυμο μισθωτή" value={tenant} onChange={e => setTenant(e.target.value)} onFocus={onFieldFocus} onBlur={onFieldBlur} placeholder="Ονοματεπώνυμο" style={field} /></div>
              </div>

              <div>
                <div style={lbl}>Μέθοδος αναπροσαρμογής</div>
                <div style={{ display: 'flex', gap: 3, padding: 3, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner }}>
                  <button onClick={() => setMethod('percent')} style={seg('percent')}>Ποσοστό</button>
                  <button onClick={() => setMethod('cpi')} style={seg('cpi')}>ΔΤΚ (ΕΛΣΤΑΤ)</button>
                  <button onClick={() => setMethod('manual')} style={seg('manual')}>Χειροκίνητο</button>
                </div>
                <div style={{ ...TT.bodySm, marginTop: 8, lineHeight: 1.5 }}>{METHOD_HINT[method]}</div>
                {/* ΠΟΙΑ ΒΑΣΗ, ΤΟ ΛΕΕΙ ΤΟ ΜΙΣΘΩΤΗΡΙΟ. Ο νόμος δίνει δύο και δίνουν
                    διαφορετικό νούμερο από τον ΙΔΙΟ δείκτη: 4,40% ή 3,30%. Χωρίς
                    την ερώτηση, θα διαλέγαμε εμείς για λογαριασμό του χρήστη μέσα
                    σε έγγραφο που υπογράφει ο ίδιος. */}
                {method === 'cpi' && (
                  <>
                    <div style={{ display: 'flex', gap: 3, padding: 3, marginTop: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner }}>
                      <button onClick={() => setCpiShare75(false)} style={share(false)}>Ολόκληρη η μεταβολή</button>
                      <button onClick={() => setCpiShare75(true)} style={share(true)}>75% της μεταβολής</button>
                    </div>
                    <div style={{ ...TT.bodySm, marginTop: 8, lineHeight: 1.5 }}>
                      Το 75% ισχύει τυπικά στις επαγγελματικές μισθώσεις. Ο όρος του μισθωτηρίου αποφασίζει.
                    </div>
                  </>
                )}
              </div>

              {/* ═══ ΤΙ ΕΧΕΙ ΗΔΗ ΕΚΔΟΘΕΙ ΓΙΑ ΑΥΤΟΝ ΤΟΝ ΜΗΝΑ ══════════════════════
                  Το «Τρέχον μίσθωμα» προσυμπληρώνεται από την καρτέλα του
                  μισθωτή, που την έγραψε η ΠΡΟΗΓΟΥΜΕΝΗ ειδοποίηση. Χωρίς αυτή
                  τη γραμμή, η δεύτερη έκδοση ανεβάζει ξανά ένα ήδη ανεβασμένο
                  μίσθωμα, με τον ίδιο δείκτη του ίδιου μήνα. */}
              {priorReady && priorUnknown && !priorSameMonth && (
                <div style={{ border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', borderRadius: T.radius.card, padding: '12px 16px', marginBottom: 16 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans }}>
                    Το μητρώο εγγράφων δεν απάντησε.
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.55 }}>
                    Δεν μπορούμε να δούμε αν έχει ήδη εκδοθεί ειδοποίηση για αυτόν τον μήνα. Ελεγξε το «Τρέχον μίσθωμα» πιο κάτω πριν προχωρήσεις.
                  </p>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, cursor: 'pointer', minHeight: 44 }}>
                    <input type="checkbox" checked={priorAck} onChange={e => setPriorAck(e.target.checked)}
                      style={{ width: 16, height: 16, accentColor: 'var(--accent)', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: 'var(--text-primary)', fontFamily: T.font.sans }}>Το έλεγξα, προχώρα</span>
                  </label>
                </div>
              )}

              {priorSameMonth && (
                <div style={{ border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', borderRadius: T.radius.card, padding: '12px 16px', marginBottom: 16 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans }}>
                    Έχει ήδη εκδοθεί ειδοποίηση για αυτόν τον μήνα ισχύος.
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.55 }}>
                    {grDate(priorSameMonth.issued_at.slice(0, 10))}
                    {typeof priorSameMonth.summary?.currentRent === 'number' && typeof priorSameMonth.summary?.newRent === 'number'
                      ? `: ${pEur(priorSameMonth.summary.currentRent)} σε ${pEur(priorSameMonth.summary.newRent)}` : ''}
                    {' · '}αριθμός {priorSameMonth.id}
                  </p>
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.55 }}>
                    Το «Τρέχον μίσθωμα» πιο κάτω είναι ΗΔΗ το αναπροσαρμοσμένο. Δεύτερη ειδοποίηση θα το ανεβάσει ξανά.
                  </p>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, cursor: 'pointer', minHeight: 44 }}>
                    <input type="checkbox" checked={priorAck} onChange={e => setPriorAck(e.target.checked)}
                      style={{ width: 16, height: 16, accentColor: 'var(--accent)', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: 'var(--text-primary)', fontFamily: T.font.sans }}>Το ξέρω, θέλω δεύτερη ειδοποίηση</span>
                  </label>
                </div>
              )}

              {/* ΤΡΕΙΣ ΙΣΕΣ ΣΤΗΛΕΣ, ΜΙΑ ΣΕΙΡΑ. Το `formGrid` κόβει κάθε στήλη σε
                  σταθερό μέγιστο: τρία πεδία των 220 με δύο κενά δεν χωρούσαν στα
                  672 του παραθύρου, οπότε το «Ισχύς από» έπεφτε μόνο του σε δεύτερη
                  σειρά, με δυόμισι στήλες κενές δεξιά του. */}
              <div {...fixedCols(3, 12, 'start')}>
                <div><div style={lbl}>Τρέχον μίσθωμα</div>{money(currentRent, setCurrentRent, '€', 'Τρέχον μίσθωμα')}</div>
                {method === 'manual'
                  ? <div><div style={lbl}>Νέο μίσθωμα</div>{money(newRentManual, setNewRentManual, '€', 'Νέο μίσθωμα')}</div>
                  : method === 'cpi'
                    ? <div><div style={lbl}>Μεταβολή ΔΤΚ</div>{readOnlyPct(cpiPct)}</div>
                    : <div><div style={lbl}>Ποσοστό</div>{money(percent, setPercent, '%', 'Ποσοστό αναπροσαρμογής', PCT_MAX)}</div>}
                <div><div style={{ ...lbl, display: 'flex', alignItems: 'center', gap: 5 }}>Ισχύς από<InfoHint>Η ημερομηνία από την οποία εφαρμόζεται το νέο μίσθωμα. Κοινοποίησε την ειδοποίηση στον μισθωτή εγκαίρως, τηρώντας την προθεσμία που ορίζει το μισθωτήριο ή ο νόμος.</InfoHint></div><DatePicker value={effective} onChange={setEffective} /></div>
              </div>

              {/* ΤΟ ΑΠΟΤΕΛΕΣΜΑ, ΖΩΝΤΑΝΑ: Τρέχον → Νέο και δίπλα η μεταβολή.
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
                <svg aria-hidden="true" width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
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
                <div><div style={lbl}>Εκμισθωτής (υπογράφων)</div><input aria-label="Ονοματεπώνυμο εκμισθωτή" value={ownerName} onChange={e => setOwnerName(e.target.value)} onFocus={onFieldFocus} onBlur={onFieldBlur} placeholder="Ονοματεπώνυμο ή επωνυμία" style={field} /></div>
                <div><div style={lbl}>Τόπος</div><input aria-label="Τόπος υπογραφής" value={place} onChange={e => setPlace(e.target.value)} onFocus={onFieldFocus} onBlur={onFieldBlur} placeholder="Αθήνα" style={field} /></div>
              </div>

              <div>
                <div style={{ ...lbl, display: 'flex', alignItems: 'center', gap: 5 }}>Ηλεκτρονική υπογραφή<InfoHint>Η υπογραφή ενσωματώνεται στο PDF και, μαζί με το QR, το καθιστά επαληθεύσιμο έγγραφο.</InfoHint></div>
                <SignaturePad onChange={setSig} height={92} />
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '11px 13px', borderRadius: T.radius.inner, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <svg aria-hidden="true" width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
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
