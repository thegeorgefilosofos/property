'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Καθολική σάρωση εγγράφου: μία φωτογραφία → σωστό tab, αυτόματα.
// Ο χρήστης ανεβάζει ΟΤΙΔΗΠΟΤΕ (λογαριασμό, πληρωμή, μισθωτήριο, τίτλο, ασφάλεια,
// ΕΝΦΙΑ, κρατικό έγγραφο). Το AI το αναγνωρίζει, εμείς το δρομολογούμε (καθαρή,
// δοκιμασμένη λογική στο lib/billing/documents.ts) και ενημερώνουμε τους σωστούς
// πίνακες. Ο χρήστης μπορεί να διορθώσει τύπο/πεδία και να προσθέσει δικά του.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useCallback, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, fe } from '@/components/Theme';
import { CustomSelect } from './UIComponents';
import {
  validateDoc, docSummaryLine,
  DOC_TYPES, DOC_FIELD_LABELS, type ScannedDoc, type DocType,
} from '@/lib/billing/documents';
import {
  scanDocument, commitScannedDoc, MAX_SCAN_MB, SYSTEM_PROMPT as SCAN_SYSTEM_PROMPT,
  RECONCILE_NONE_LABEL, RECONCILE_NONE_HINT, type ReconcileQuestion,
} from './scanDoc';
import { inferRole } from '@/lib/contacts/roles';

// Το prompt ζει στο scanDoc.ts (μαζί με όλη τη μηχανή σάρωσης). Επανεξάγεται εδώ
// επειδή οθόνες που δεν ανήκουν σε αυτή τη ροή (Ενοικιαστής, Αρχείο) το εισάγουν
// ιστορικά από εδώ — η αλλαγή διαδρομής θα ήταν άσκοπη ρήξη.
export const SYSTEM_PROMPT = SCAN_SYSTEM_PROMPT;

interface Props {
  propertyId: string; userId?: string; onSaved?: () => void;
  /**
   * Λέει προς τα έξω αν η σάρωση ή η αποθήκευση τρέχει ΤΩΡΑ.
   *
   * ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΚΛΕΙΝΕΙ. Το παράθυρο που φιλοξενεί τη σάρωση ακούει πλέον
   * Escape (πριν δεν άκουγε τίποτα). Το κλείσιμό του καλεί `closeQuickAdd`,
   * που ΔΙΑΓΡΑΦΕΙ το κενό προσχέδιο ακινήτου. Δηλαδή ένα άστοχο Escape στη
   * μέση της αναγνώρισης έσβηνε το ακίνητο που μόλις δημιουργήθηκε — και ο
   * χρήστης δεν είχε κανέναν τρόπο να καταλάβει τι έγινε.
   *
   * Το component δεν μπορεί να το λύσει μόνο του: η απόφαση «τι σημαίνει
   * κλείσιμο» ανήκει σε αυτόν που το φιλοξενεί. Του λέμε μόνο αν δουλεύει.
   */
  onBusyChange?: (busy: boolean) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  electricity: 'Ρεύμα', water: 'Νερό', gas: 'Φυσικό αέριο', internet: 'Internet',
  insurance: 'Ασφάλεια', streaming: 'Streaming & Συνδρομές', taxes: 'ΕΝΦΙΑ & Φόροι',
  municipal: 'Δημοτικά Τέλη', security: 'Security / Συναγερμός', common: 'Κοινόχρηστα',
  maintenance: 'Συντήρηση', elevator: 'Συντήρηση Ασανσέρ', pool: 'Καθαρισμός Πισίνας',
  gardener: 'Κηπουρός', cleaner: 'Καθαριότητα', plumber: 'Υδραυλικός', electrician: 'Ηλεκτρολόγος',
  other: 'Άλλο',
};

// Ποια πεδία δείχνει η φόρμα ανά τύπο εγγράφου.
type FieldDef = { key: keyof ScannedDoc; label: string; type?: 'number' | 'date' };
// ΤΑ ΠΕΝΤΕ ΠΕΔΙΑ ΤΑΙΡΙΑΣΜΑΤΟΣ είναι ΟΡΑΤΑ και διορθώσιμα για λογαριασμό/απόδειξη:
// πάροχος, ΑΦΜ παρόχου, ποσό, ημερομηνία έκδοσης, περίοδος από–έως. Πριν, το ΑΦΜ
// υπήρχε μόνο στο μπλοκ μισθωτηρίου και η περίοδος ήταν ελεύθερο κείμενο — δηλαδή
// δύο από τα πέντε δεν έφταναν ποτέ στη βάση.
const TYPE_FIELDS: Record<DocType, FieldDef[]> = {
  bill: [
    { key: 'provider', label: 'Πάροχος' },
    { key: 'provider_afm', label: 'ΑΦΜ παρόχου' },
    { key: 'amount', label: 'Ποσό (€)', type: 'number' },
    { key: 'issue_date', label: 'Ημερομηνία έκδοσης', type: 'date' },
    { key: 'due_date', label: 'Ημερομηνία λήξης', type: 'date' },
    { key: 'period_from', label: 'Περίοδος από', type: 'date' },
    { key: 'period_to', label: 'Περίοδος έως', type: 'date' },
  ],
  payment: [
    { key: 'provider', label: 'Δικαιούχος / Πάροχος' },
    { key: 'provider_afm', label: 'ΑΦΜ παρόχου' },
    { key: 'amount', label: 'Ποσό (€)', type: 'number' },
    { key: 'issue_date', label: 'Ημερομηνία πληρωμής', type: 'date' },
    { key: 'period_from', label: 'Αφορά περίοδο από', type: 'date' },
    { key: 'period_to', label: 'Αφορά περίοδο έως', type: 'date' },
  ],
  lease: [
    { key: 'tenant_name', label: 'Ονοματεπώνυμο ενοικιαστή' },
    { key: 'monthly_rent', label: 'Μηνιαίο ενοίκιο (€)', type: 'number' },
    { key: 'lease_start', label: 'Έναρξη μίσθωσης', type: 'date' },
    { key: 'lease_end', label: 'Λήξη μίσθωσης', type: 'date' },
    { key: 'deposit', label: 'Εγγύηση (€)', type: 'number' },
    { key: 'afm', label: 'ΑΦΜ ενοικιαστή' },
  ],
  insurance: [
    { key: 'provider', label: 'Ασφαλιστική εταιρεία' },
    { key: 'premium', label: 'Ασφάλιστρο (€)', type: 'number' },
    { key: 'coverage', label: 'Κάλυψη (€)', type: 'number' },
    { key: 'policy_number', label: 'Αριθμός συμβολαίου' },
    { key: 'expiry_date', label: 'Λήξη ασφάλισης', type: 'date' },
  ],
  deed: [
    { key: 'provider', label: 'Συμβολαιογράφος / Πηγή' },
    { key: 'purchase_price', label: 'Τίμημα αγοράς (€)', type: 'number' },
    { key: 'purchase_date', label: 'Ημερομηνία αγοράς', type: 'date' },
    { key: 'obj_value', label: 'Αντικειμενική αξία (€)', type: 'number' },
    { key: 'atak', label: 'ΑΤΑΚ' },
    { key: 'year_built', label: 'Έτος κατασκευής', type: 'number' },
    { key: 'sqm', label: 'Τετραγωνικά (m²)', type: 'number' },
  ],
  tax: [
    { key: 'provider', label: 'Φορέας (π.χ. ΑΑΔΕ)' },
    { key: 'amount', label: 'Ποσό (€)', type: 'number' },
    { key: 'tax_year', label: 'Έτος', type: 'number' },
    { key: 'due_date', label: 'Ημερομηνία λήξης πληρωμής', type: 'date' },
  ],
  government: [
    { key: 'title', label: 'Τίτλος εγγράφου' },
    { key: 'provider', label: 'Φορέας / Υπηρεσία' },
    { key: 'issue_date', label: 'Ημερομηνία', type: 'date' },
  ],
  other: [
    { key: 'title', label: 'Τίτλος' },
    { key: 'provider', label: 'Σχετικό με' },
    { key: 'issue_date', label: 'Ημερομηνία', type: 'date' },
  ],
};

// Πεδίο εισόδου. Τρεις καταστάσεις, όχι δύο: εντάξει · «λείπει» (η OCR δεν το
// διάβασε και το ζητάμε) · «δεν είναι έγκυρο» (το διαβάσαμε αλλά δεν βγάζει
// νόημα — π.χ. ΑΦΜ που δεν περνά το checksum της ΑΑΔΕ). Η διάκριση μετράει:
// «λείπει» είναι δουλειά του χρήστη, «άκυρο» είναι λάθος ανάγνωση.
const Field = ({ label, value, onChange, type = 'text', invalid = false, bad = false, hint }: {
  label: string; value: string | number; onChange: (v: string) => void;
  type?: string; invalid?: boolean; bad?: boolean; hint?: string;
}) => {
  const tone = bad ? 'var(--negative)' : invalid ? 'var(--warning)' : '';
  return (
    <div>
      <label style={{ fontSize: 9, fontWeight: 700, color: tone || 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', display: 'block', marginBottom: 4, fontFamily: T.font.sans }}>
        {label}{bad ? ' • δεν είναι έγκυρο' : invalid ? ' • λείπει' : ''}
      </label>
      <input
        type={type}
        value={String(value ?? '')}
        onChange={e => onChange(e.target.value)}
        style={{ width: '100%', background: 'var(--bg-base)', border: `1px solid ${tone || 'var(--border-default)'}`, borderRadius: 6, padding: '10px 16px', color: 'var(--text-primary)', fontSize: 14, fontFamily: type === 'number' ? T.font.mono : T.font.sans, outline: 'none', boxSizing: 'border-box' as const, transition: 'border-color 0.15s' }}
        onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
        onBlur={e => (e.target.style.borderColor = tone || 'var(--border-default)')}
      />
      {hint && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 3, fontFamily: T.font.sans }}>{hint}</div>}
    </div>
  );
};

const NUM_KEYS = new Set<keyof ScannedDoc>(['amount', 'monthly_rent', 'deposit', 'premium', 'coverage', 'purchase_price', 'obj_value', 'year_built', 'sqm', 'tax_year', 'kwh', 'cubic_meters', 'millesimi', 'vat_rate']);

export default function DocumentScan({ propertyId, userId = '', onSaved, onBusyChange }: Props) {
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  // Το ref διαβάζεται ΜΕΣΑ σε useCallback, όχι στην απόδοση. Ο κανόνας
  // `react-hooks/refs` δεν μπορεί να ξέρει ότι το `pressable` απλώς αποθηκεύει
  // τη συνάρτηση — και έχει δίκιο να μην το υποθέτει. Αυτή είναι η καθιερωμένη
  // μορφή, και διαβάζεται καλύτερα: δύο ονομασμένες ενέργειες αντί για δύο
  // ανώνυμα βέλη μέσα στο JSX.
  const openCamera = useCallback(() => cameraRef.current?.click(), []);
  const openFilePicker = useCallback(() => fileRef.current?.click(), []);

  const [file, setFile] = useState<File | null>(null);
  const [image, setImage] = useState('');
  const [scanning, setScanning] = useState(false);
  const [edited, setEdited] = useState<ScannedDoc | null>(null);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<'upload' | 'review' | 'done'>('upload');
  const [error, setError] = useState('');
  const [savedInfo, setSavedInfo] = useState<string[]>([]);
  const [newField, setNewField] = useState({ label: '', value: '' });

  // Μία γραμμή, δύο καταστάσεις: όσο διαβάζεται το έγγραφο ή όσο γράφεται στη
  // βάση, το παράθυρο από πάνω δεν επιτρέπεται να κλείσει και να σβήσει το
  // προσχέδιο. Το effect τρέχει ΜΕΤΑ την απόδοση, οπότε ο γονέας μαθαίνει την
  // αλλαγή χωρίς να γράφει state μέσα σε render.
  const busy = scanning || saving;
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => () => { onBusyChange?.(false); }, [onBusyChange]);
  // Ερώτηση συμφωνίας: όταν η βεβαιότητα ταιριάσματος με εκκρεμή λογαριασμό είναι
  // χαμηλή, ΔΕΝ εξοφλούμε σιωπηλά — ρωτάμε ποιον (ή κανέναν).
  const [ask, setAsk] = useState<ReconcileQuestion | null>(null);
  // Πρόταση αποθήκευσης του εκδότη (προμηθευτή/επαγγελματία) στις Επαφές, μετά τη
  // σάρωση λογαριασμού/απόδειξης. Ποτέ αυτόματα — μόνο με ρητή επιβεβαίωση χρήστη.
  const [contactState, setContactState] =
    useState<'cta' | 'saving' | 'saved' | 'exists' | 'error' | 'dismissed'>('cta');

  const setF = (key: keyof ScannedDoc, raw: string) =>
    setEdited(p => {
      if (!p) return p;
      const next: ScannedDoc = { ...p, [key]: NUM_KEYS.has(key) ? (parseFloat(raw) || undefined) : raw };
      // Όταν ο χρήστης διορθώνει τις ημερομηνίες της περιόδου, το ελεύθερο κείμενο
      // («Ιούνιος 2026») που είχε διαβάσει η OCR παύει να ισχύει — δεν το κρατάμε
      // για να μη γραφτεί ένα όνομα λογαριασμού που λέει άλλο μήνα από τις στήλες.
      if (key === 'period_from' || key === 'period_to') next.period = undefined;
      return next;
    });

  const loadFile = useCallback(async (f: File) => {
    if (!f.type.startsWith('image/') && f.type !== 'application/pdf' && !f.name.match(/\.(csv|xlsx|xls|txt)$/i)) {
      setError('Υποστηριζόμενα: JPG, PNG, HEIC, PDF, CSV, Excel'); return;
    }
    // Όριο μεγέθους: προστατεύει και την αποθήκευση και την πληρωμένη κλήση AI από
    // τεράστια αρχεία (το base64 φουσκώνει ~33%, οπότε 10MB ≈ 13MB payload).
    if (f.size > MAX_SCAN_MB * 1024 * 1024) {
      setError(`Το αρχείο είναι πολύ μεγάλο (${(f.size / 1048576).toFixed(1)}MB). Όριο ${MAX_SCAN_MB}MB.`); return;
    }
    setFile(f); setEdited(null); setError(''); setAsk(null); setStep('review');
    // Προεπισκόπηση (μόνο για να βλέπει ο χρήστης τι σάρωσε).
    const reader = new FileReader();
    reader.onload = e => setImage(String(e.target?.result || ''));
    reader.readAsDataURL(f);
    // Η ΑΝΑΓΝΩΣΗ γίνεται από τη ΜΙΑ μηχανή σάρωσης (scanDoc.ts) — καμία δεύτερη
    // υλοποίηση prompt/parse εδώ. Ό,τι διορθώσουμε εκεί, διορθώνεται παντού.
    setScanning(true);
    const r = await scanDocument(f);
    setScanning(false);
    if (r.doc) setEdited(r.doc);
    else { setError(r.error || 'unreadable'); setEdited({ doc_type: 'other', confidence: 0 }); }
  }, []);

  // Στρίψιμο null/undefined από payload (χρησιμοποιείται στις Επαφές παρακάτω).
  const nrm = (s?: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

  // Η ΚΑΤΑΧΩΡΙΣΗ. Όλη η εγγραφή (8 πίνακες + αρχειοθέτηση + συμφωνία) ζει στο
  // scanDoc.ts ώστε να είναι ΙΔΙΑ από κάθε οθόνη. Εδώ μένει μόνο η οθόνη.
  // `choice`: undefined → άσε τη μηχανή να κρίνει (και να ρωτήσει αν δεν ξέρει)·
  //           string    → ο χρήστης διάλεξε ποιον λογαριασμό εξοφλεί·
  //           null      → ο χρήστης είπε «κανέναν».
  const save = async (choice?: string | null) => {
    if (!edited) return;
    setSaving(true); setError('');
    const r = await commitScannedDoc({
      doc: edited, file, propertyId, userId,
      ...(choice !== undefined ? { reconcileChoice: choice } : {}),
    });
    setSaving(false);
    // Χαμηλή βεβαιότητα ταιριάσματος: ΤΙΠΟΤΑ δεν γράφτηκε, ρωτάμε τον χρήστη.
    if (r.ask) { setAsk(r.ask); return; }
    if (r.error || !r.saved.length) { setError('save'); return; }
    setAsk(null);
    setSavedInfo(r.saved);
    setStep('done');
    onSaved?.();
  };

  // Κράτα μόνο ψηφία (για ΑΦΜ/τηλέφωνο) ώστε η σύγκριση/αποθήκευση να είναι καθαρή.
  const digits = (s?: string) => (s || '').replace(/\D/g, '');

  // Αποθήκευση του εκδότη στις Επαφές — dedup ΠΡΩΤΑ, μετά insert. Καμία αυτόματη
  // εγγραφή: καλείται μόνο από το κουμπί «Αποθήκευση στις Επαφές».
  const saveContact = async () => {
    if (!edited || !userId) return;
    const fullName = (edited.provider || '').trim();
    if (!fullName) return;
    setContactState('saving');
    try {
      // Ο εκδότης ενός λογαριασμού έχει το ΑΦΜ του στο provider_afm (το `afm` είναι
      // του αντισυμβαλλόμενου, π.χ. ενοικιαστή) — αλλιώς η επαφή έμπαινε χωρίς ΑΦΜ.
      const afm = digits(edited.provider_afm || edited.afm);
      // DEDUP: φέρνουμε τις επαφές του ακινήτου/χρήστη και ελέγχουμε στη JS (το
      // ΑΦΜ βρίσκεται μέσα στο JSON του notes, δεν κάνει εύκολα query).
      const { data: existing } = await supabase.from('contacts')
        .select('id, full_name, phone, notes')
        .eq('property_id', propertyId).eq('user_id', userId);
      const dup = (existing || []).some(c => {
        let storedAfm = '';
        try { storedAfm = digits((JSON.parse((c.notes as string) || '{}')?.extra?.afm) as string); } catch { /* αγνόησε άκυρο JSON */ }
        if (afm && storedAfm && afm === storedAfm) return true;
        if (nrm(fullName) && nrm(c.full_name as string) === nrm(fullName)) return true;
        return false;
      });
      if (dup) { setContactState('exists'); return; }
      // Σχηματισμός γραμμής επαφής (ίδιο schema με την καρτέλα Επαφές).
      const extra: Record<string, string> = {};
      if (afm) extra.afm = afm;
      const role = inferRole(`${fullName} ${CATEGORY_LABELS[edited.category || ''] || ''}`) || 'other';
      // Τηλέφωνο και email από το ΙΔΙΟ χαρτί. Πριν έμπαιναν null και έβγαινε
      // επαφή που δεν μπορείς να καλέσεις — ο χρήστης έπρεπε να τα ξαναγράψει
      // με το χέρι, ενώ ήταν τυπωμένα μπροστά του.
      const phone = (edited.provider_phone || '').trim() || null;
      const email = (edited.provider_email || '').trim() || null;
      const { error: insErr } = await supabase.from('contacts').insert({
        property_id: propertyId, user_id: userId, role,
        full_name: fullName, phone, email,
        notes: JSON.stringify({ __v: 2, extra, notes: '' }),
      });
      if (insErr) { setContactState('error'); return; }
      setContactState('saved');
    } catch { setContactState('error'); }
  };

  const reset = () => {
    setStep('upload'); setFile(null); setImage(''); setEdited(null);
    setSaving(false); setError(''); setSavedInfo([]); setNewField({ label: '', value: '' });
    setContactState('cta'); setAsk(null);
  };

  // ── Οθόνη επιτυχίας ─────────────────────────────────────────────────────────
  if (step === 'done' && edited) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 20px', fontFamily: T.font.sans }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--positive-soft)', border: '1px solid var(--positive-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="var(--positive)" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5" /></svg>
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6, letterSpacing: '-0.01em' }}>Καταχωρήθηκε</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 18 }}>{docSummaryLine(edited)}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
          {savedInfo.map(s => (
            <span key={s} style={{ fontSize: 11, fontWeight: 700, color: 'var(--positive)', background: 'var(--positive-soft)', border: '1px solid var(--positive-border)', borderRadius: T.radius.pill, padding: '4px 12px', fontFamily: T.font.sans }}>{s}</span>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 26 }}>Ενημερώθηκαν αυτόματα οι σχετικές καρτέλες.</div>

        {/* Πρόταση αποθήκευσης εκδότη στις Επαφές (μόνο για λογαριασμό/απόδειξη με όνομα
            προμηθευτή, και εφόσον ξέρουμε ποιος χρήστης — αλλιώς σιωπηλά παραλείπεται). */}
        {(() => {
          const supplierName = (edited.provider || '').trim();
          const isInvoiceLike = edited.doc_type === 'bill' || edited.doc_type === 'payment';
          if (!userId || !isInvoiceLike || !supplierName) return null;
          const afm = digits(edited.provider_afm || edited.afm);

          if (contactState === 'saved' || contactState === 'exists') {
            const okSaved = contactState === 'saved';
            return (
              <div style={{ maxWidth: 420, margin: '0 auto 22px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '11px 16px' }}>
                {okSaved && <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--positive)" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5" /></svg>}
                <span style={{ fontSize: 13, fontWeight: 600, color: okSaved ? 'var(--positive)' : 'var(--text-secondary)' }}>
                  {okSaved ? 'Αποθηκεύτηκε στις Επαφές' : 'Υπάρχει ήδη στις Επαφές'}
                </span>
              </div>
            );
          }
          if (contactState === 'dismissed') return null;

          const saving = contactState === 'saving';
          return (
            <div style={{ maxWidth: 420, margin: '0 auto 22px', textAlign: 'left', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '16px 18px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, letterSpacing: '-0.01em' }}>
                Να αποθηκεύσω τον προμηθευτή «{supplierName}» στις Επαφές;
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.45, marginBottom: 12 }}>
                Θα τον βρίσκεις εύκολα την επόμενη φορά.
              </div>
              <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '10px 12px', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Όνομα</span>
                  <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, textAlign: 'right', wordBreak: 'break-word' }}>{supplierName}</span>
                </div>
                {afm && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>ΑΦΜ</span>
                    <span style={{ fontSize: 13, color: 'var(--text-primary)', fontFamily: T.font.mono }}>{afm}</span>
                  </div>
                )}
              </div>
              {contactState === 'error' && (
                <div style={{ fontSize: 11, color: 'var(--warning)', marginBottom: 10 }}>Δεν αποθηκεύτηκε. Δοκίμασε ξανά.</div>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-start' }}>
                <button onClick={saveContact} disabled={saving}
                  style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: T.radius.btn, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1, fontFamily: T.font.sans }}>
                  {saving ? 'Αποθήκευση…' : 'Αποθήκευση στις Επαφές'}
                </button>
                <button onClick={() => setContactState('dismissed')} disabled={saving}
                  style={{ background: 'transparent', color: 'var(--text-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.btn, padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: T.font.sans }}>
                  Όχι τώρα
                </button>
              </div>
            </div>
          );
        })()}

        <button onClick={reset} style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: T.radius.pill, padding: '11px 30px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: T.font.sans }}>Σάρωσε νέο έγγραφο</button>
      </div>
    );
  }

  const typeMeta = edited ? DOC_TYPES.find(t => t.id === edited.doc_type) : null;
  const v = edited ? validateDoc(edited) : { blocking: [], recommended: [], invalid: [] };
  const canSave = v.blocking.length === 0;
  const label = (f: string) => DOC_FIELD_LABELS[f] || f;

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>
      {/* ΤΟΝ ΤΙΤΛΟ ΤΟΝ ΔΙΝΕΙ ΤΟ ΠΑΡΑΘΥΡΟ. Εδώ γραφόταν δεύτερος, «Πρόσθεσε ένα
          έγγραφο», κάτω από το «Σάρωση εγγράφου» του κελύφους — και έμενε
          ορατός ΚΑΙ πάνω από την οθόνη επιτυχίας «Καταχωρήθηκε», όπου δεν
          σαρώνει πια τίποτα. Η εξήγηση για το τι δέχεται μένει: είναι
          πληροφορία, όχι επικεφαλίδα, και είναι χρήσιμη ακριβώς πριν το
          πρώτο άγγιγμα. */}
      {step === 'upload' && (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: 20 }}>
          Φωτογράφισε ή ανέβασε <strong>οτιδήποτε</strong>, λογαριασμό, απόδειξη, μισθωτήριο, τίτλο, ασφάλεια, <span title="Ενιαίος Φόρος Ιδιοκτησίας Ακινήτων">ΕΝΦΙΑ</span>, κρατικό έγγραφο. Το αναγνωρίζουμε και το καταχωρούμε στο σωστό σημείο.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: step === 'review' && image ? 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))' : '1fr', gap: 20 }}>
        {/* Αριστερά: upload ή προεπισκόπηση */}
        <div>
          {step === 'upload' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: 12 }}>
              {/* ΓΡΑΜΜΕΝΟ ΡΗΤΑ, ΟΧΙ ΜΕ ΤΟΝ ΒΟΗΘΟ `pressable`, ΚΑΙ ΕΧΕΙ ΛΟΓΟ.
                  Το JSX spread κρύβει τις ιδιότητες από τη στατική ανάλυση: με
                  `{...pressable(…)}` ο μεταγλωττιστής του React παύει να βλέπει τι
                  δέχεται το στοιχείο και αρχίζει να αναφέρει τις μεταλλάξεις
                  `currentTarget.style` των διπλανών χειριστών. Δοκιμάστηκε και
                  μετρήθηκε: με spread +2 σφάλματα, χωρίς 0. Δύο ιδιότητες
                  παραπάνω είναι φθηνότερες από έναν φύλακα που χαλαρώνει. */}
              <div role="button" tabIndex={0} onClick={openCamera} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openCamera()}}}
                style={{ border: '1px solid var(--border-default)', borderRadius: T.radius.card, minHeight: 172, cursor: 'pointer', background: 'var(--bg-elevated)', transition: 'background-color 0.2s, border-color 0.2s, color 0.2s, box-shadow 0.2s, transform 0.2s, opacity 0.2s', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-dim)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.background = 'var(--bg-elevated)'; }}>
                <svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Φωτογράφισε</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Κάμερα κινητού · tablet</div>
              </div>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && loadFile(e.target.files[0])} />

              <div role="button" tabIndex={0} onClick={openFilePicker} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openFilePicker()}}}
                style={{ border: '1px solid var(--border-default)', borderRadius: T.radius.card, minHeight: 172, cursor: 'pointer', background: 'var(--bg-elevated)', transition: 'background-color 0.2s, border-color 0.2s, color 0.2s, box-shadow 0.2s, transform 0.2s, opacity 0.2s', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-dim)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.background = 'var(--bg-elevated)'; }}>
                <svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Ανέβασε αρχείο</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>JPG · PNG · PDF</div>
              </div>
              <input ref={fileRef} type="file" accept="image/*,.pdf,.csv,.txt,.xlsx,.xls,.ods" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && loadFile(e.target.files[0])} />
            </div>
          ) : (
            <div>
              {file?.type === 'application/pdf' ? (
                <div style={{ borderRadius: T.radius.card, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', padding: 28, textAlign: 'center' }}>
                  <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 10px' }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{file.name}</div>
                </div>
              ) : (
                <img src={image} alt="Έγγραφο" style={{ width: '100%', borderRadius: T.radius.card, border: '1px solid var(--border-subtle)', maxHeight: 480, objectFit: 'contain', background: 'var(--bg-base)' }} />
              )}
              {scanning && (
                <div style={{ marginTop: 12, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: T.radius.inner, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}><strong style={{ color: 'var(--accent)' }}>Claude AI</strong> αναγνωρίζει το έγγραφο…</div>
                </div>
              )}
              <button onClick={reset} style={{ marginTop: 10, fontSize: 11, color: 'var(--text-tertiary)', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: T.radius.btn, padding: '6px 14px', cursor: 'pointer', fontFamily: T.font.sans }}>Νέα σάρωση</button>

              {error && (() => {
                const title = error === 'unreadable' ? 'Δεν διάβασα καθαρά το έγγραφο'
                  : error === 'key_missing' ? 'Η αυτόματη ανάγνωση δεν είναι ενεργή ακόμη'
                  : error === 'save' ? 'Κάτι πήγε στραβά στην αποθήκευση'
                  : 'Η υπηρεσία ανάγνωσης δεν είναι διαθέσιμη τώρα';
                const tips = error === 'unreadable'
                  ? ['Τράβα τη φωτογραφία με καλό φως, ίσια, να χωράει όλο το έγγραφο', 'Αν έχεις PDF από τον πάροχο/φορέα, ανέβασέ το, διαβάζεται καλύτερα']
                  : error === 'key_missing' ? ['Συμπλήρωσε τα πεδία χειροκίνητα και αποθήκευσε κανονικά', 'Για αυτόματη ανάγνωση χρειάζεται το κλειδί AI στις ρυθμίσεις']
                  : error === 'save' ? ['Δοκίμασε ξανά, τα στοιχεία σου διατηρούνται']
                  : ['Δοκίμασε ξανά σε λίγο', 'Μπορείς να συμπληρώσεις τα πεδία χειροκίνητα'];
                return (
                  <div style={{ marginTop: 12, background: 'var(--warning-soft)', border: '1px solid var(--warning-border)', borderRadius: T.radius.inner, padding: '12px 16px' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--warning)', marginBottom: 8 }}>{title}</div>
                    <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {tips.map((t, i) => <li key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{t}</li>)}
                    </ul>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Δεξιά: αναγνώριση + επεξεργασία */}
        {step === 'review' && edited && !scanning && (
          <div>
            {/* Τύπος εγγράφου, chips για διόρθωση */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Τύπος εγγράφου {edited.confidence ? `· ${edited.confidence}% βεβαιότητα` : ''}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {DOC_TYPES.map(dt => {
                  const active = edited.doc_type === dt.id;
                  return (
                    <button key={dt.id} onClick={() => setEdited(p => p ? { ...p, doc_type: dt.id } : p)} title={dt.hint}
                      style={{ fontSize: 12, fontWeight: active ? 700 : 500, padding: '6px 12px', borderRadius: T.radius.pill, cursor: 'pointer', fontFamily: T.font.sans, border: `1px solid ${active ? 'var(--accent)' : 'var(--border-default)'}`, background: active ? 'var(--accent)' : 'transparent', color: active ? 'var(--accent-text)' : 'var(--text-secondary)', transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s' }}>
                      {dt.label}
                    </button>
                  );
                })}
              </div>
              {typeMeta && (
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8, lineHeight: 1.5 }}>
                  Θα ενημερώσει: <strong style={{ color: 'var(--text-secondary)' }}>{typeMeta.targets.join(' · ')}</strong>
                </div>
              )}
            </div>

            {/* Τι δεν διάβασα και τι δεν βγάζει νόημα — ξεχωριστά, και τα δύο ειλικρινά. */}
            {v.invalid.length > 0 && (
              <div style={{ background: 'var(--negative-soft)', border: '1px solid var(--negative-border)', borderRadius: T.radius.inner, padding: '10px 14px', marginBottom: 10 }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                  Διάβασα <strong>{v.invalid.map(label).join(', ')}</strong> αλλά δεν είναι έγκυρο{v.invalid.length > 1 ? 'α' : ''}
                  {v.invalid.includes('provider_afm') || v.invalid.includes('afm') ? ' (το ΑΦΜ δεν περνά τον έλεγχο της ΑΑΔΕ)' : ''}. Διόρθωσέ το ή άφησέ το κενό — δεν το αποθηκεύω για σωστό.
                </div>
              </div>
            )}
            {(v.blocking.length > 0 || v.recommended.length > 0) && (
              <div style={{ background: v.blocking.length ? 'var(--warning-soft)' : 'var(--bg-elevated)', border: `1px solid ${v.blocking.length ? 'var(--warning-border)' : 'var(--border-subtle)'}`, borderRadius: T.radius.inner, padding: '10px 14px', marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                  {v.blocking.length
                    ? <>Χρειάζονται τα βασικά: <strong>{v.blocking.map(label).join(', ')}</strong>. Συμπλήρωσέ τα για να αποθηκεύσω σωστά.</>
                    : <>Δεν διάβασα: <strong>{v.recommended.map(label).join(', ')}</strong>. Μπορείς να αποθηκεύσεις έτσι, αλλά με αυτά ο έλεγχος «πληρώθηκε» γίνεται σίγουρος.</>}
                </div>
              </div>
            )}

            {/* Πεδία ανά τύπο */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: 10 }}>
              {(edited.doc_type === 'bill' || edited.doc_type === 'payment') && (
                <CustomSelect label="Κατηγορία" value={edited.category || 'other'}
                  onChange={v => setEdited(p => p ? { ...p, category: v } : p)}
                  options={Object.entries(CATEGORY_LABELS).map(([val, l]) => ({ value: val, label: l as string }))} />
              )}
              {TYPE_FIELDS[edited.doc_type].map(f => {
                const k = String(f.key);
                return (
                  <Field key={k} label={f.label} type={f.type}
                    value={(edited[f.key] as string | number) ?? ''}
                    invalid={v.blocking.includes(k) || v.recommended.includes(k)
                      || (k === 'period_to' && v.recommended.includes('period_from'))}
                    bad={v.invalid.includes(k) || (k === 'period_to' && v.invalid.includes('period_from'))}
                    // Ό,τι έγραφε το χαρτί για την περίοδο, ορατό δίπλα στις ημερομηνίες.
                    hint={k === 'period_from' && edited.period ? `Στο χαρτί: ${edited.period}` : undefined}
                    onChange={val => setF(f.key, val)} />
                );
              })}
            </div>

            {/* Σημειώσεις + προσθήκη δικού σου πεδίου */}
            <div style={{ marginTop: 12 }}>
              <Field label="Σημειώσεις" value={edited.notes || ''} onChange={val => setEdited(p => p ? { ...p, notes: val } : p)} />
            </div>

            {(edited.custom || []).length > 0 && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(edited.custom || []).map((c, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input value={c.label} placeholder="Πεδίο" onChange={e => setEdited(p => { if (!p) return p; const cs = [...(p.custom || [])]; cs[i] = { ...cs[i], label: e.target.value }; return { ...p, custom: cs }; })}
                      style={{ flex: '0 0 38%', background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 6, padding: '8px 12px', color: 'var(--text-primary)', fontSize: 12, fontFamily: T.font.sans }} />
                    <input value={c.value} placeholder="Τιμή" onChange={e => setEdited(p => { if (!p) return p; const cs = [...(p.custom || [])]; cs[i] = { ...cs[i], value: e.target.value }; return { ...p, custom: cs }; })}
                      style={{ flex: 1, background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 6, padding: '8px 12px', color: 'var(--text-primary)', fontSize: 12, fontFamily: T.font.sans }} />
                    <button onClick={() => setEdited(p => p ? { ...p, custom: (p.custom || []).filter((_, j) => j !== i) } : p)} title="Αφαίρεση"
                      style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer' }}>×</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
              <input value={newField.label} placeholder="Νέο πεδίο (π.χ. Αριθμός πρωτοκόλλου)" onChange={e => setNewField(f => ({ ...f, label: e.target.value }))}
                style={{ flex: '0 0 38%', background: 'var(--bg-base)', border: '1px dashed var(--border-default)', borderRadius: 6, padding: '8px 12px', color: 'var(--text-primary)', fontSize: 12, fontFamily: T.font.sans }} />
              <input value={newField.value} placeholder="Τιμή" onChange={e => setNewField(f => ({ ...f, value: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter' && newField.label.trim()) { setEdited(p => p ? { ...p, custom: [...(p.custom || []), { ...newField }] } : p); setNewField({ label: '', value: '' }); } }}
                style={{ flex: 1, background: 'var(--bg-base)', border: '1px dashed var(--border-default)', borderRadius: 6, padding: '8px 12px', color: 'var(--text-primary)', fontSize: 12, fontFamily: T.font.sans }} />
              <button onClick={() => { if (newField.label.trim()) { setEdited(p => p ? { ...p, custom: [...(p.custom || []), { ...newField }] } : p); setNewField({ label: '', value: '' }); } }}
                title="Προσθήκη πεδίου" style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 6, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--accent)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>+</button>
            </div>

            {/* Ερώτηση συμφωνίας. Εμφανίζεται ΠΡΙΝ γραφτεί οτιδήποτε: η μηχανή βρήκε
                υποψηφίους αλλά δεν έχει αρκετή απόδειξη. Δίνουμε τους λόγους κάθε
                υποψηφίου, ώστε η επιλογή του χρήστη να είναι τεκμηριωμένη. */}
            {ask && (
              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--accent-border)', borderRadius: T.radius.card, padding: '14px 16px', marginTop: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{ask.question}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 12 }}>
                  Δεν διαλέγω μόνος μου: αν εξοφλήσω τον λάθος, θα δεις πληρωμένο κάτι που χρωστάς.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {ask.options.map(o => (
                    <button key={o.id} onClick={() => save(o.id)} disabled={saving}
                      style={{ textAlign: 'left', background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: T.radius.inner, padding: '10px 14px', cursor: saving ? 'default' : 'pointer', fontFamily: T.font.sans }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{o.label}</div>
                      {o.reasons.length > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3, lineHeight: 1.45 }}>{o.reasons.join(' · ')}</div>
                      )}
                    </button>
                  ))}
                  <button onClick={() => save(null)} disabled={saving}
                    style={{ textAlign: 'left', background: 'transparent', border: '1px dashed var(--border-default)', borderRadius: T.radius.inner, padding: '10px 14px', cursor: saving ? 'default' : 'pointer', fontFamily: T.font.sans }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{RECONCILE_NONE_LABEL}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>{RECONCILE_NONE_HINT}</div>
                  </button>
                </div>
              </div>
            )}

            {/* Αποθήκευση */}
            <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '14px 16px', border: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{typeMeta?.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                  {edited.amount ? fe(edited.amount) : edited.monthly_rent ? `${fe(edited.monthly_rent)}/μήνα` : edited.premium ? fe(edited.premium) : fe(0)}
                </div>
              </div>
              <button onClick={() => save()} disabled={saving || !canSave || !!ask}
                style={{ background: canSave && !ask ? 'var(--accent)' : 'var(--bg-elevated)', color: canSave && !ask ? 'var(--accent-text)' : 'var(--text-tertiary)', border: canSave && !ask ? 'none' : '1px solid var(--border-default)', borderRadius: T.radius.btn, padding: '12px 24px', fontSize: 13, fontWeight: 700, cursor: canSave && !ask ? 'pointer' : 'not-allowed', fontFamily: T.font.sans, whiteSpace: 'nowrap' }}>
                {saving ? 'Αποθήκευση…' : ask ? 'Διάλεξε παραπάνω' : !canSave ? 'Συμπλήρωσε τα βασικά' : 'Καταχώρηση'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
