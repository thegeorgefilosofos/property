'use client';

// ═══════════════════════════════════════════════════════════════════════════
// OwnerSplit — Κατανομή σε συνιδιοκτήτες + διαχειριστική αμοιβή (P2, persona
// «διαχειριστής ακινήτων»). Διάλεξε ακίνητο + περίοδο, όρισε ιδιοκτήτες/ποσοστά
// και αμοιβή διαχείρισης· βλέπεις το καθαρό κάθε ιδιοκτήτη (μετά έξοδα & αμοιβή)
// και εξάγεις επίσημη, επαληθεύσιμη «Κατάσταση κατανομής» (true-PDF).
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as properties from '@/lib/data/properties';
import * as rentStore from '@/lib/data/rent';
import * as expenses from '@/lib/data/expenses';
import { T, TT, Btn, Badge, EmptyState, Modal, Spinner, ABSENT } from '@/components/Theme';
import { acceptNumeric, PCT_MAX } from '@/lib/core/numInput';
import { Building2 } from 'lucide-react';
import { InfoHint } from './InfoHint';
import { CustomSelect as Select } from './UIComponents';
import ScanButton from './ScanButton';
import { num } from './docUtils';
import { computeSplit, type OwnerShare } from '@/lib/accounting/ownerSplit';
import { issueDocument } from '@/lib/documents/issue';
import { generateReportPdf, pEur, pSigned, pPct, type PdfReportModel } from '@/lib/pdf/pdfReport';
import type { ReportBranding } from '@/lib/reportBranding';
import { MONTHS_NOM } from '@/lib/core/months';
import { failed } from '@/lib/core/dbError';
import { monthEndIso } from '@/lib/core/time';
import { useRemembered } from '@/components/useRememberedFlag';

interface Prop { id: string; name: string; address: string | null }
const LS = (pid: string) => `po_owner_split_${pid}`;

/** Η αποθηκευμένη διάταξη, όπως γράφεται στον περιηγητή. */
type SavedSplit = { rows: Row[]; feePct: string; managerName: string };
// Σταθερή αναφορά: νέο αντικείμενο σε κάθε απόδοση θα έβαζε τη React σε βρόχο.
const EMPTY_SPLIT: SavedSplit = { rows: [{ name: '', pct: '', afm: '' }], feePct: '', managerName: '' };

interface Row { name: string; pct: string; afm: string }

export default function OwnerSplit({ open, onClose, userId, supabase, branding }: {
  open: boolean; onClose: () => void; userId: string; supabase: SupabaseClient; branding?: ReportBranding | null;
}) {
  const nowYear = new Date().getFullYear();
  const [props, setProps] = useState<Prop[]>([]);
  const [propId, setPropId] = useState('');
  const [year, setYear] = useState(nowYear);
  const [month, setMonth] = useState(0);
  const [hoverRow, setHoverRow] = useState<number | null>(null);
  // ΤΑ ΠΟΣΑ ΦΕΡΟΥΝ ΤΟ ΚΛΕΙΔΙ ΤΟΥΣ, ΩΣΤΕ ΝΑ ΜΗ ΔΙΑΒΑΖΟΝΤΑΙ ΠΟΤΕ ΚΑΤΩ ΑΠΟ ΛΑΘΟΣ
  // ΟΝΟΜΑ. Η σημαία ακύρωσης παρακάτω εξηγεί γιατί: το αργό ερώτημα του
  // προηγούμενου ακινήτου απαντούσε τελευταίο και έγραφε πάνω από το γρήγορο
  // του τρέχοντος. Η σημαία λύνει την ΑΠΑΝΤΗΣΗ που έρχεται καθυστερημένα· το
  // κλειδί λύνει και την ΕΜΦΑΝΙΣΗ: όσο τα ποσά δεν είναι αυτού του ακινήτου,
  // αυτής της χρονιάς και αυτού του μήνα, δεν υπάρχουν. Μαζί έφυγε και το
  // `setFigures(null)` που ήταν σύγχρονη γραφή μέσα σε effect.
  const [loadedFigures, setFigures] = useState<{ key: string; gross: number; expenses: number } | null>(null);
  const figuresKey = open && propId ? `${propId}|${year}|${month}` : '';
  const figures = loadedFigures && loadedFigures.key === figuresKey ? loadedFigures : null;
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Η ΣΗΜΑΙΑ ΦΟΡΤΩΣΗΣ ΜΠΑΙΝΕΙ ΜΕΣΑ ΣΤΗΝ ΑΛΥΣΙΔΑ, ΟΧΙ ΠΡΙΝ ΑΠΟ ΑΥΤΗΝ. Το
  // `setLoading(true)` στο σώμα του effect προκαλεί δεύτερη απόδοση πριν καν
  // ξεκινήσει το αίτημα — και η κατάσταση ξεκινά ήδη `true`, οπότε στο πρώτο
  // άνοιγμα δεν άλλαζε τίποτα. Έμεινε μόνο εκεί που κάτι πράγματι αλλάζει.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const ps = await properties.list<Prop>(supabase, userId, { orderBy: 'name' });
      if (!alive) return;
      setProps(ps); setPropId(prev => prev || ps[0]?.id || ''); setLoading(false);
    })();
    return () => { alive = false; };
  }, [open, userId, supabase]);

  // Η ΑΠΟΘΗΚΕΥΜΕΝΗ ΔΙΑΤΑΞΗ ΙΔΙΟΚΤΗΤΩΝ ΖΕΙ ΣΤΟΝ ΠΕΡΙΗΓΗΤΗ, ΟΧΙ ΣΤΗ REACT. Ηταν
  // effect που έγραφε τρεις καταστάσεις με την αλλαγή ακινήτου: μία περιττή
  // απόδοση· για ένα καρέ η φόρμα έδειχνε τους ΙΔΙΟΚΤΗΤΕΣ ΤΟΥ ΠΡΟΗΓΟΥΜΕΝΟΥ
  // ακινήτου κάτω από το όνομα του νέου. Σε οθόνη που βγάζει επίσημο χαρτί με
  // ποσοστά συνιδιοκτησίας, εκείνο το καρέ δεν είναι λεπτομέρεια.
  //
  // Διαβάζεται πλέον κατά την απόδοση, με μνημονευμένο στιγμιότυπο. Οι τοπικές
  // αλλαγές του χρήστη ζουν σε ξεχωριστή κατάσταση από πάνω: όσο δεν έχει
  // αγγίξει τίποτα για ΑΥΤΟ το ακίνητο, βλέπει ό,τι είναι γραμμένο.
  const [stored, setStored] = useRemembered<SavedSplit>(
    LS(propId),
    raw => { try { const v = raw ? JSON.parse(raw) : null; return v?.rows?.length ? v as SavedSplit : EMPTY_SPLIT } catch { return EMPTY_SPLIT } },
    v => JSON.stringify(v),
    EMPTY_SPLIT,
  );
  const [edited, setEdited] = useState<{ key: string; value: SavedSplit } | null>(null);
  const split = edited && edited.key === propId ? edited.value : stored;
  const rows = split.rows;
  const feePct = split.feePct;
  const managerName = split.managerName;
  const patch = (p: Partial<SavedSplit>) => setEdited({ key: propId, value: { ...split, ...p } });
  const setRows = (next: Row[] | ((prev: Row[]) => Row[])) =>
    patch({ rows: typeof next === 'function' ? next(rows) : next });
  const setFeePct = (v: string) => patch({ feePct: v });
  const setManagerName = (v: string) => patch({ managerName: v });

  // Άντληση εσόδων/εξόδων περιόδου για το ακίνητο.
  //
  // ── ΣΗΜΑΙΑ ΑΚΥΡΩΣΗΣ, ΓΙΑΤΙ ΕΔΩ ΒΓΑΙΝΕΙ ΕΠΙΣΗΜΟ ΧΑΡΤΙ ──────────────────────
  // ΧΩΡΙΣ ΑΥΤΗΝ, το αργό ερώτημα του ΠΡΟΗΓΟΥΜΕΝΟΥ ακινήτου απαντούσε τελευταίο
  // και έγραφε πάνω από το γρήγορο του τρέχοντος. Ο διαχειριστής διάλεγε
  // «Αλεξάνδρας 12» (πολλές δόσεις, αργό), άλλαζε σε «Πατησίων 5» (γρήγορο),
  // και η οθόνη κρατούσε τα ποσά του πρώτου κάτω από το όνομα του δεύτερου.
  //
  // Δεν είναι οπτικό λάθος: το `exportPdf` καλεί ΠΡΩΤΑ την `issueDocument` με
  // `subject: prop.name` και τα ποσά του state, άρα η λάθος κατανομή
  // καταχωρείται στο μητρώο εγγράφων με αριθμό και QR επαλήθευσης και ο
  // συνιδιοκτήτης παίρνει χαρτί που του δίνει τετραπλάσιο μερίδιο.
  //
  // Το πρώτο effect του ίδιου αρχείου έχει ήδη `let alive = true`· αυτό εδώ,
  // που είναι το μόνο που παράγει ΠΟΣΑ, δεν το είχε πάρει ποτέ.
  useEffect(() => {
    if (!figuresKey) return;
    let alive = true;
    (async () => {
      const from = `${year}-${String(month || 1).padStart(2, '0')}-01`;
      const to = month > 0 ? monthEndIso(year, month) : `${year}-12-31`;
      // ── ΤΑΜΕΙΑΚΗ ΒΑΣΗ, ΓΙΑΤΙ Η ΚΑΤΑΝΟΜΗ ΜΟΙΡΑΖΕΙ ΜΕΤΡΗΤΑ ─────────────────────
      // Το ερώτημα φιλτράριζε με `period_year/period_month`, δηλαδή μετρούσε τα
      // μισθώματα ΠΟΥ ΑΦΟΡΟΥΝ τον μήνα, όχι αυτά που ΜΠΗΚΑΝ μέσα στον μήνα. Μια
      // δόση Δεκεμβρίου που εισπράχθηκε στις 8 Ιανουαρίου πιστωνόταν στον
      // Δεκέμβριο: ο συνιδιοκτήτης έπαιρνε χαρτί που του αναλογούσε μερίδιο από
      // χρήματα που δεν είχαν μπει ακόμη στον λογαριασμό. Και η ίδια δόση
      // ξαναφαινόταν στο ταμειακό ημερολόγιο του Ιανουαρίου.
      //
      // Ο κανόνας είναι γραμμένος μία φορά, στο lib/data/rent.ts: «το βιβλίο
      // είναι ΤΑΜΕΙΑΚΟ, μια δόση ανήκει στη χρήση που εισπράχθηκε». Η κατανομή
      // μοιράζει μετρητά, άρα ακολουθεί τον ίδιο κανόνα — και η ετικέτα
      // «Εισπράχθηκαν» λέει επιτέλους την αλήθεια.
      //
      // Το ερώτημα δεν φιλτράρει πια περίοδο: μια δόση που εισπράχθηκε φέτος
      // μπορεί να ανήκει σε περσινό μήνα και θα έλειπε. Το φιλτράρισμα το
      // κάνει η `collectedIn` πάνω στην ημερομηνία βιβλίου.
      const [rAll, e] = await Promise.all([
        rentStore.ofProperties<rentStore.BookableRent>(
          supabase, [propId], rentStore.LEDGER_COLUMNS, userId, { paid: true }),
        expenses.inRangeOfProperty(supabase, propId, from, to),
      ]);
      const r = rentStore.collectedIn((rAll || []) as rentStore.BookableRent[], year, month);
      // Και τα δύο ερωτήματα ζητούν `amount`: αυτό είναι ό,τι χρειάζεται εδώ και
      // αυτό δηλώνεται. Το `any` έκρυβε ότι ένα λάθος όνομα στήλης θα έδινε μηδέν.
      const sumAmount = (rows: { amount?: number | string | null }[] | null) =>
        (rows || []).reduce((s, x) => s + num(x.amount ?? 0), 0);
      if (!alive) return;
      setFigures({ key: figuresKey, gross: sumAmount(r), expenses: sumAmount(e as { amount: number | null }[]) });
    })();
    return () => { alive = false; };
  // Το `userId` χρησιμοποιείται μέσα στο ερώτημα και λείπει από τις εξαρτήσεις:
  // μπαίνει, ώστε αλλαγή χρήστη να ξαναφέρνει δεδομένα αντί να κρατά τα παλιά.
  }, [open, propId, year, month, userId, supabase, figuresKey]);

  const owners: OwnerShare[] = useMemo(() => rows.filter(r => r.name.trim()).map(r => ({ name: r.name.trim(), pct: num(r.pct), afm: r.afm.trim() || undefined })), [rows]);
  const result = useMemo(() => computeSplit({ grossIncome: figures?.gross || 0, expenses: figures?.expenses || 0, owners, managementFeePct: num(feePct), managerName }), [figures, owners, feePct, managerName]);
  // Το ποσό που δεν έχει ιδιοκτήτη (ή που δόθηκε δύο φορές), σε ευρώ και σε ποσοστό.
  // `null` όταν τα ποσοστά κλείνουν στα 100 — τότε δεν υπάρχει τίποτα να ειπωθεί.
  const unassigned = useMemo(() => {
    if (result.valid || !result.owners.length) return null;
    const netSum = result.owners.reduce((s, o) => s + o.net, 0);
    return {
      label: result.pctSum > 100 ? 'Δόθηκε δύο φορές' : 'Χωρίς ιδιοκτήτη',
      pct: Math.round((100 - result.pctSum) * 100) / 100,
      amount: Math.round((result.distributable - netSum) * 100) / 100,
    };
  }, [result]);

  const prop = props.find(p => p.id === propId);
  const periodLabel = month === 0 ? `Έτος ${year}` : `${MONTHS_NOM[month - 1]} ${year}`;

  // Η αποθήκευση περνά από τον ίδιο δρόμο που διαβάζει: γράφει ΚΑΙ ειδοποιεί,
  // ώστε μια δεύτερη ανοιχτή καρτέλα να μη μείνει με την παλιά διάταξη.
  const saveLayout = () => setStored({ rows, feePct, managerName });

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
    } catch (e) { setErr(failed('Η κατανομή δεν δημιουργήθηκε', e)); }
    finally { setBusy(false); }
  };

  // Το ύψος ήταν καρφωμένο 40: κάτω από τα 44 που θέλει το δάχτυλο, σε επτά
  // πεδία της ίδιας φόρμας. Η κοινή κλίμακα το ανεβάζει σε coarse pointer.
  const field: React.CSSProperties = { height: T.h.lg, padding: '0 13px', borderRadius: T.radius.inner, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 14, fontFamily: T.font.sans, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.14s' };
  const onFieldFocus = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => { e.currentTarget.style.borderColor = 'var(--accent)'; };
  const onFieldBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => { e.currentTarget.style.borderColor = 'var(--border-default)'; };
  // ── ΔΕΝ ΚΛΕΙΝΕΙ ΟΣΟ ΕΚΔΙΔΕΙ ───────────────────────────────────────────────
  // Το χειρόγραφο κέλυφος δεν άκουγε Escape· το Modal ακούει. Η `exportPdf`
  // πρώτα ΚΑΤΑΧΩΡΕΙ έγγραφο στη βάση (issueDocument: αριθμός εγγράφου, σύνδεσμος
  // επαλήθευσης) και ΜΕΤΑ φτιάχνει το PDF. Ένα Escape ανάμεσα στα δύο αφήνει
  // εκδομένο έγγραφο χωρίς αρχείο στα χέρια του χρήστη και το μήνυμα αποτυχίας
  // δεν εμφανίζεται ποτέ. Όσο το κουμπί λέει «Δημιουργία…», το παράθυρο μένει.
  const requestClose = () => { if (!busy) onClose(); };
  const miniStat = (label: string, value: string, strong = false): React.ReactNode => (
    <div>
      <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>{label}</div>
      <div style={{ fontSize: strong ? 16 : 14, fontWeight: strong ? 700 : 600, color: strong ? 'var(--text-primary)' : 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums', marginTop: 3, fontFamily: T.font.sans }}>{value}</div>
    </div>
  );

  return (
    // ΤΟ ΠΑΡΑΘΥΡΟ ΗΤΑΝ ΓΡΑΜΜΕΝΟ ΣΤΟ ΧΕΡΙ (127 γραμμές markup): δικό του scrim,
    // δικό του radius 18, δική του κεφαλίδα με «×» σε padding 4 (στόχος ~21×30,
    // κάτω από το μέγεθος αφής) — και ΧΩΡΙΣ Escape, χωρίς επιστροφή εστίασης,
    // χωρίς κλείδωμα κύλισης του φόντου. Το Modal τα δίνει και τα τέσσερα.
    <Modal open onClose={requestClose} size="lg"
      ariaLabel="Ποσοστά συνιδιοκτησίας"
      icon={<svg aria-hidden="true" width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
      title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>Κατανομή σε ιδιοκτήτες<InfoHint>Μοιράζει τα καθαρά έσοδα της περιόδου στους συνιδιοκτήτες, ανάλογα με το ποσοστό του καθενός. Αφαιρεί πρώτα τα έξοδα και τη διαχειριστική αμοιβή και βγάζει επίσημη «Κατάσταση κατανομής» σε PDF, με αριθμό εγγράφου και QR επαλήθευσης, για τον κάθε ιδιοκτήτη.</InfoHint></span>}
      subtitle="Το καθαρό κάθε συνιδιοκτήτη, μετά τα έξοδα και τη διαχειριστική αμοιβή"
      footerInfo={`${prop?.name || ABSENT} · ${periodLabel}`}
      footer={<>
        <Btn variant="secondary" onClick={() => { saveLayout(); onClose(); }}>Αποθήκευση και κλείσιμο</Btn>
        <Btn variant="primary" onClick={exportPdf} disabled={busy || !result.valid}>{busy ? 'Δημιουργία…' : 'Κατάσταση κατανομής (PDF)'}</Btn>
      </>}>
      {loading ? <Spinner size={18} label="Φόρτωση…" /> : props.length === 0 ? <EmptyState icon={<Building2 size={20} />} title="Κανένα ακίνητο ακόμη" hint="Πρόσθεσε ακίνητο για να ορίσεις ποσοστά συνιδιοκτησίας." /> : (
      <>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: '2 1 200px', minWidth: 0 }}>
            <Select ariaLabel="Ακίνητο" value={propId} onChange={setPropId} options={props.map(p => ({ value: p.id, label: p.name }))} />
          </div>
          <div style={{ flex: '1 1 90px', minWidth: 0 }}>
            <Select ariaLabel="Έτος" value={String(year)} onChange={v => setYear(Number(v))} options={Array.from({ length: 7 }, (_, i) => nowYear - i).map(y => ({ value: String(y), label: String(y) }))} />
          </div>
          <div style={{ flex: '1 1 130px', minWidth: 0 }}>
            <Select ariaLabel="Μήνας" value={String(month)} onChange={v => setMonth(Number(v))} options={[{ value: '0', label: 'Όλο το έτος' }, ...MONTHS_NOM.map((m, i) => ({ value: String(i + 1), label: m }))]} />
          </div>
        </div>

        {/* Ιδιοκτήτες */}
        <div>
          <div style={{ ...TT.label, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>Ιδιοκτήτες και ποσοστά<InfoHint>Πρόσθεσε κάθε συνιδιοκτήτη με το ποσοστό ιδιοκτησίας του. Τα ποσοστά πρέπει να αθροίζουν στο 100%. Το ΑΦΜ είναι προαιρετικό και εμφανίζεται στην επίσημη κατάσταση.</InfoHint></div>
          <div style={{ marginBottom: 10 }}>
            <ScanButton onExtract={doc => {
              const ex = (doc.owners || []).filter(o => o?.name);
              if (ex.length) setRows(ex.map(o => ({ name: o.name || '', afm: o.afm || '', pct: o.pct != null ? String(o.pct) : '' })));
              else if (doc.landlord_name) setRows([{ name: doc.landlord_name, afm: doc.afm || '', pct: '' }]);
            }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rows.map((r, i) => (
              // Η αφαίρεση εμφανίζεται μόνο όταν υπάρχουν πολλοί ιδιοκτήτες και
              // μόνο όταν ο κέρσορας/δάχτυλο περνά πάνω από τη γραμμή (ήσυχο UI).
              <div key={i} onMouseEnter={() => setHoverRow(i)} onMouseLeave={() => setHoverRow(null)} onFocusCapture={() => setHoverRow(i)}
                style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input aria-label="Ονομα συνιδιοκτήτη" value={r.name} onChange={e => setRow(i, 'name', e.target.value)} onFocus={onFieldFocus} onBlur={onFieldBlur} placeholder="Όνομα" style={{ ...field, flex: '2 1 140px' }} />
                <input aria-label="ΑΦΜ συνιδιοκτήτη" value={r.afm} onChange={e => setRow(i, 'afm', e.target.value.replace(/\D/g, '').slice(0, 9))} onFocus={onFieldFocus} onBlur={onFieldBlur} placeholder="ΑΦΜ" style={{ ...field, flex: '1 1 100px' }} inputMode="numeric" />
                <div style={{ position: 'relative', flex: '0 0 92px' }}>
                  {/* ΤΟ ΠΟΣΟΣΤΟ ΙΔΙΟΚΤΗΣΙΑΣ ΔΕΝ ΠΕΡΝΑΕΙ ΤΟ 100 ΚΑΙ ΔΕΝ ΓΙΝΕΤΑΙ
                      ΑΡΝΗΤΙΚΟ. Το πεδίο δεχόταν «250» και «-40» και το ποσό
                      κάθε συνιδιοκτήτη έβγαινε από εκεί — σε κατάσταση που
                      κατεβαίνει ως PDF και πάει στον λογιστή. */}
                  <input aria-label="Ποσοστό συνιδιοκτησίας" value={r.pct} onChange={e => { const v = acceptNumeric(e.target.value, PCT_MAX); if (v !== null) setRow(i, 'pct', v); }} onFocus={onFieldFocus} onBlur={onFieldBlur} placeholder="" style={{ ...field, width: '100%', paddingRight: 32, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} inputMode="decimal" />
                  <span style={{ position: 'absolute', right: 13, top: 0, height: T.h.lg, display: 'flex', alignItems: 'center', color: 'var(--text-tertiary)', fontSize: 'var(--fs-base)', pointerEvents: 'none' }}>%</span>
                </div>
                <button onClick={() => delRow(i)} aria-label="Αφαίρεση ιδιοκτήτη" title="Αφαίρεση"
                  style={{ width: 26, flexShrink: 0, background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0, visibility: rows.length > 1 && hoverRow === i ? 'visible' : 'hidden', transition: 'opacity 0.14s' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--negative)'; }} onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-tertiary)'; }}>×</button>
              </div>
            ))}
          </div>
          <button onClick={addRow} style={{ ...TT.caption, marginTop: 10, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontWeight: 700 }}>+ Προσθήκη ιδιοκτήτη</button>
        </div>

        {/* Αμοιβή διαχείρισης */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 160px' }}>
            <div style={{ ...TT.label, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>Αμοιβή διαχείρισης<InfoHint>Η αμοιβή του διαχειριστή, ως ποσοστό επί των εσόδων. Αφαιρείται από το σύνολο πριν μοιραστεί το καθαρό στους ιδιοκτήτες. Άφησέ την κενή αν δεν υπάρχει.</InfoHint></div>
            <div style={{ position: 'relative' }}>
              <input aria-label="Αμοιβή διαχείρισης σε ποσοστό εσόδων" value={feePct} onChange={e => { const v = acceptNumeric(e.target.value, PCT_MAX); if (v !== null) setFeePct(v); }} onFocus={onFieldFocus} onBlur={onFieldBlur} placeholder="" style={{ ...field, width: '100%', paddingRight: 84, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} inputMode="decimal" />
              <span style={{ position: 'absolute', right: 13, top: 0, height: T.h.lg, display: 'flex', alignItems: 'center', color: 'var(--text-tertiary)', fontSize: 12, pointerEvents: 'none', whiteSpace: 'nowrap' }}>% εσόδων</span>
            </div>
          </div>
          <div style={{ flex: '2 1 200px' }}>
            <div style={{ ...TT.label, marginBottom: 6 }}>Διαχειριστής (προαιρετικό)</div>
            <input aria-label="Επωνυμία διαχειριστή" value={managerName} onChange={e => setManagerName(e.target.value)} onFocus={onFieldFocus} onBlur={onFieldBlur} placeholder="Επωνυμία διαχειριστή" style={{ ...field, width: '100%' }} />
          </div>
        </div>

        {/* Αποτέλεσμα */}
        {figures && (
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center', padding: '14px 16px', background: 'var(--bg-elevated)' }}>
              {miniStat('Εισπράχθηκαν', pEur(result.gross))}
              {miniStat('Έξοδα', pEur(result.expenses))}
              {miniStat('Αμοιβή', pEur(result.managementFee))}
              {miniStat('Προς διανομή', pEur(result.distributable), true)}
              {/* ═══ ΤΟ ΚΙΤΡΙΝΟ ΕΦΥΓΕ, ΚΑΙ ΜΑΖΙ ΤΟΥ Η ΑΣΑΦΕΙΑ ══════════════════
                  Το σήμα έβγαινε πράσινο στα 100% και κίτρινο σε οτιδήποτε
                  άλλο — δύο σημασιολογικά χρώματα για έναν αριθμό που τα λέει
                  ήδη όλα, στη μοναδική οθόνη όπου δεν υπάρχει τίποτα άλλο
                  χρωματιστό. Και το «ΠΟΣΟΣΤΑ 0,00%» σκέτο δεν έλεγε ΤΙ ΠΕΡΙΜΕΝΕΙ:
                  ο χρήστης έβλεπε κίτρινο και μάντευε.
                  Τώρα το ίδιο το κείμενο λέει το ζητούμενο («0,00% από 100%»),
                  η γραμμή από κάτω το μεταφράζει σε ευρώ και το χρώμα μένει
                  ουδέτερο όπως σε κάθε άλλο σήμα της εφαρμογής. */}
              <span style={{ marginLeft: 'auto' }}>
                <Badge>Ποσοστά {result.valid ? pPct(result.pctSum) : `${pPct(result.pctSum)} από ${pPct(100)}`}</Badge>
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 12, padding: '8px 16px', borderTop: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>Ιδιοκτήτης</span>
              <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontFamily: T.font.sans, textAlign: 'right' }}>Ποσοστό</span>
              <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontFamily: T.font.sans, textAlign: 'right' }}>Παρακράτηση</span>
              <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontFamily: T.font.sans, textAlign: 'right', minWidth: 84 }}>Καθαρό</span>
            </div>
            {result.owners.map((o, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 12, padding: '9px 16px', borderTop: '1px solid var(--border-subtle)', fontSize: 'var(--fs-base)', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-primary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: T.font.sans }}>{o.name}</span>
                <span style={{ color: 'var(--text-tertiary)', fontSize: 12, fontVariantNumeric: 'tabular-nums', textAlign: 'right', whiteSpace: 'nowrap', fontFamily: T.font.sans }}>{pPct(o.pct)}</span>
                <span style={{ color: 'var(--text-tertiary)', fontSize: 12, fontVariantNumeric: 'tabular-nums', textAlign: 'right', fontFamily: T.font.sans }}>{o.expenseShare + o.feeShare > 0 ? `−${pEur(o.expenseShare + o.feeShare)}` : pEur(0)}</span>
                <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', textAlign: 'right', minWidth: 84, fontFamily: T.font.sans, color: 'var(--text-primary)' }}>{pEur(o.net)}</span>
              </div>
            ))}
            {/* Το αδιάθετο υπόλοιπο, ονομαστικά.
                Όταν τα ποσοστά δεν αθροίζουν 100, ο πίνακας ΔΕΝ κλείνει πια στο
                «Προς διανομή» — και σωστά: ο υπολογισμός σταμάτησε να φορτώνει
                σιωπηλά τη διαφορά στον μεγαλύτερο ιδιοκτήτη. Αντί ο χρήστης να
                ψάχνει γιατί οι γραμμές δεν βγάζουν το σύνολο, το λείπον ποσό
                γράφεται εδώ σε ευρώ: δείχνει ακριβώς πόσα δεν έχουν ιδιοκτήτη. */}
            {unassigned !== null && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 12, padding: '9px 16px', borderTop: '1px solid var(--border-subtle)', fontSize: 'var(--fs-base)', alignItems: 'center', background: 'var(--bg-elevated)' }}>
                <span style={{ color: 'var(--text-secondary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: T.font.sans }}>{unassigned.label}</span>
                <span style={{ color: 'var(--text-tertiary)', fontSize: 12, fontVariantNumeric: 'tabular-nums', textAlign: 'right', whiteSpace: 'nowrap', fontFamily: T.font.sans }}>{pPct(unassigned.pct)}</span>
                <span style={{ color: 'var(--text-tertiary)', fontSize: 12, fontVariantNumeric: 'tabular-nums', textAlign: 'right', fontFamily: T.font.sans }}>{pEur(0)}</span>
                <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', textAlign: 'right', minWidth: 84, fontFamily: T.font.sans, color: 'var(--text-secondary)' }}>{pSigned(unassigned.amount)}</span>
              </div>
            )}
          </div>
        )}

        {err && <div style={{ fontSize: 'var(--fs-base)', color: 'var(--negative)', background: 'var(--negative-soft)', border: '1px solid var(--negative-border)', borderRadius: 10, padding: '10px 14px' }}>{err}</div>}
      </>
      )}
    </Modal>
  );
}
