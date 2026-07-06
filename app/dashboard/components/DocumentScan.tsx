'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Καθολική σάρωση εγγράφου: μία φωτογραφία → σωστό tab, αυτόματα.
// Ο χρήστης ανεβάζει ΟΤΙΔΗΠΟΤΕ (λογαριασμό, πληρωμή, μισθωτήριο, τίτλο, ασφάλεια,
// ΕΝΦΙΑ, κρατικό έγγραφο). Το AI το αναγνωρίζει, εμείς το δρομολογούμε (καθαρή,
// δοκιμασμένη λογική στο lib/billing/documents.ts) και ενημερώνουμε τους σωστούς
// πίνακες. Ο χρήστης μπορεί να διορθώσει τύπο/πεδία και να προσθέσει δικά του.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, fe } from '@/components/Theme';
import { matchBillToPayment, type PendingBill } from '@/lib/billing/parse';
import {
  classifyDocType, validateDoc, planDocSave, docSummaryLine,
  DOC_TYPES, DOC_FIELD_LABELS, type ScannedDoc, type DocType,
} from '@/lib/billing/documents';

interface Props { propertyId: string; userId?: string; onSaved?: () => void; }

const CATEGORY_LABELS: Record<string, string> = {
  electricity: 'Ρεύμα', water: 'Νερό', gas: 'Φυσικό Αέριο', internet: 'Internet',
  insurance: 'Ασφάλεια', streaming: 'Streaming & Συνδρομές', taxes: 'ΕΝΦΙΑ & Φόροι',
  municipal: 'Δημοτικά Τέλη', security: 'Security / Συναγερμός', common: 'Κοινόχρηστα',
  maintenance: 'Συντήρηση', elevator: 'Συντήρηση Ασανσέρ', pool: 'Καθαρισμός Πισίνας',
  gardener: 'Κηπουρός', cleaner: 'Καθαριότητα', plumber: 'Υδραυλικός', electrician: 'Ηλεκτρολόγος',
  other: 'Άλλο',
};

// Ποια πεδία δείχνει η φόρμα ανά τύπο εγγράφου.
type FieldDef = { key: keyof ScannedDoc; label: string; type?: 'number' | 'date' };
const TYPE_FIELDS: Record<DocType, FieldDef[]> = {
  bill: [
    { key: 'provider', label: 'Πάροχος' },
    { key: 'amount', label: 'Ποσό (€)', type: 'number' },
    { key: 'due_date', label: 'Ημ. λήξης', type: 'date' },
    { key: 'period', label: 'Περίοδος' },
  ],
  payment: [
    { key: 'provider', label: 'Δικαιούχος / Πάροχος' },
    { key: 'amount', label: 'Ποσό (€)', type: 'number' },
    { key: 'issue_date', label: 'Ημ. πληρωμής', type: 'date' },
    { key: 'period', label: 'Αφορά περίοδο' },
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
    { key: 'purchase_date', label: 'Ημ. αγοράς', type: 'date' },
    { key: 'obj_value', label: 'Αντικειμενική αξία (€)', type: 'number' },
    { key: 'atak', label: 'ΑΤΑΚ' },
    { key: 'year_built', label: 'Έτος κατασκευής', type: 'number' },
    { key: 'sqm', label: 'Τετραγωνικά (m²)', type: 'number' },
  ],
  tax: [
    { key: 'provider', label: 'Φορέας (π.χ. ΑΑΔΕ)' },
    { key: 'amount', label: 'Ποσό (€)', type: 'number' },
    { key: 'tax_year', label: 'Έτος', type: 'number' },
    { key: 'due_date', label: 'Ημ. λήξης πληρωμής', type: 'date' },
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

const SYSTEM_PROMPT = `Είσαι ο κορυφαίος βοηθός διαχείρισης ακινήτων στον κόσμο. Ο χρήστης ανεβάζει ΟΠΟΙΟΔΗΠΟΤΕ έγγραφο σχετικό με το ακίνητό του. Αναγνώρισε ΤΙ ΕΙΝΑΙ και εξήγαγε τα σωστά στοιχεία. Επέστρεψε ΜΟΝΟ valid JSON, χωρίς markdown:
{
  "doc_type": "bill|payment|lease|deed|insurance|tax|government|other",
  "title": "σύντομος περιγραφικός τίτλος",
  "provider": "πάροχος/αντισυμβαλλόμενος/ασφαλιστική/φορέας/συμβολαιογράφος",
  "category": "(μόνο για bill/payment) electricity|water|gas|internet|insurance|streaming|taxes|municipal|security|common|maintenance|elevator|pool|gardener|cleaner|plumber|electrician|other",
  "amount": συνολικό ποσό σε ευρώ ή null,
  "due_date": "YYYY-MM-DD (λήξη πληρωμής) ή null",
  "issue_date": "YYYY-MM-DD (έκδοση/πληρωμή) ή null",
  "period": "περίοδος ή null",
  "tenant_name": "(μισθωτήριο) ονοματεπώνυμο ενοικιαστή ή null",
  "monthly_rent": "(μισθωτήριο) μηνιαίο ενοίκιο € ή null",
  "lease_start": "(μισθωτήριο) YYYY-MM-DD ή null",
  "lease_end": "(μισθωτήριο) YYYY-MM-DD ή null",
  "deposit": "(μισθωτήριο) εγγύηση € ή null",
  "afm": "ΑΦΜ ή null",
  "purchase_price": "(τίτλος/συμβόλαιο) τίμημα αγοράς € ή null",
  "purchase_date": "(τίτλος) YYYY-MM-DD ή null",
  "obj_value": "(τίτλος) αντικειμενική αξία € ή null",
  "atak": "(τίτλος) ΑΤΑΚ ακινήτου ή null",
  "year_built": "έτος κατασκευής ή null",
  "sqm": "τετραγωνικά μέτρα ή null",
  "policy_number": "(ασφαλιστήριο) αριθμός συμβολαίου ή null",
  "premium": "(ασφαλιστήριο) ασφάλιστρο € ή null",
  "coverage": "(ασφαλιστήριο) ποσό κάλυψης € ή null",
  "expiry_date": "(ασφαλιστήριο) YYYY-MM-DD λήξη ή null",
  "tax_year": "(φορολογικό) έτος ή null",
  "kwh": "(ρεύμα) κιλοβατώρες ή null",
  "cubic_meters": "(νερό/αέριο) m³ ή null",
  "millesimi": "(κοινόχρηστα) χιλιοστά ή null",
  "vat_rate": "ΦΠΑ % ή null",
  "account_num": "αριθμός παροχής/λογαριασμού ή null",
  "notes": "οτιδήποτε άλλο σημαντικό",
  "confidence": 0-100
}
ΚΑΝΟΝΕΣ ΑΝΑΓΝΩΡΙΣΗΣ: μισθωτήριο/συμφωνητικό μίσθωσης→"lease". Ασφαλιστήριο/ασφάλεια ακινήτου→"insurance". ΕΝΦΙΑ/Ε9/εκκαθαριστικό/φόρος→"tax". Τίτλος ιδιοκτησίας/συμβόλαιο αγοραπωλησίας→"deed". ΑΜΑ/πολεοδομία/βεβαίωση/δημόσιο έγγραφο→"government". Απόδειξη/βεβαίωση πληρωμής→"payment". Λογαριασμός ΔΕΗ/ΕΥΔΑΠ/αερίου/internet/κοινοχρήστων→"bill". Ημερομηνίες πάντα YYYY-MM-DD. Τελεία για δεκαδικά. Ό,τι δεν υπάρχει→null.`;

// Πεδίο εισόδου (ίδιο look με BillsAIScan).
const Field = ({ label, value, onChange, type = 'text', invalid = false }: {
  label: string; value: string | number; onChange: (v: string) => void; type?: string; invalid?: boolean;
}) => (
  <div>
    <label style={{ fontSize: 9, fontWeight: 700, color: invalid ? 'var(--warning)' : 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', display: 'block', marginBottom: 4, fontFamily: T.font.sans }}>
      {label}{invalid ? ' • λείπει' : ''}
    </label>
    <input
      type={type}
      value={String(value ?? '')}
      onChange={e => onChange(e.target.value)}
      style={{ width: '100%', background: 'var(--bg-base)', border: `1px solid ${invalid ? 'var(--warning)' : 'var(--border-default)'}`, borderRadius: 6, padding: '9px 12px', color: 'var(--text-primary)', fontSize: 13, fontFamily: type === 'number' ? T.font.mono : T.font.sans, outline: 'none', boxSizing: 'border-box' as const, transition: 'border-color 0.15s' }}
      onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
      onBlur={e => (e.target.style.borderColor = invalid ? 'var(--warning)' : 'var(--border-default)')}
    />
  </div>
);

const NUM_KEYS = new Set<keyof ScannedDoc>(['amount', 'monthly_rent', 'deposit', 'premium', 'coverage', 'purchase_price', 'obj_value', 'year_built', 'sqm', 'tax_year', 'kwh', 'cubic_meters', 'millesimi', 'vat_rate']);

// Ανθεκτική μετατροπή αριθμού (χειρίζεται «1.200,50», «1,234.56», «€», κενά).
// Το AI μπορεί να επιστρέψει string· χωρίς αυτό, μη-αριθμητικά θα έσπαγαν το insert.
const numify = (v: unknown): number | undefined => {
  if (typeof v === 'number') return isFinite(v) ? v : undefined;
  if (typeof v !== 'string') return undefined;
  const raw = v.replace(/[€\s]/g, '');
  if (!/\d/.test(raw)) return undefined;
  const clean = /,\d{1,2}$/.test(raw) ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '');
  const n = parseFloat(clean.replace(/[^0-9.\-]/g, ''));
  return isFinite(n) ? n : undefined;
};

export default function DocumentScan({ propertyId, userId = '', onSaved }: Props) {
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [image, setImage] = useState('');
  const [scanning, setScanning] = useState(false);
  const [edited, setEdited] = useState<ScannedDoc | null>(null);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<'upload' | 'review' | 'done'>('upload');
  const [error, setError] = useState('');
  const [savedInfo, setSavedInfo] = useState<string[]>([]);
  const [newField, setNewField] = useState({ label: '', value: '' });

  const setF = (key: keyof ScannedDoc, raw: string) =>
    setEdited(p => p ? { ...p, [key]: NUM_KEYS.has(key) ? (parseFloat(raw) || undefined) : raw } : p);

  const loadFile = useCallback(async (f: File) => {
    if (!f.type.startsWith('image/') && f.type !== 'application/pdf' && !f.name.match(/\.(csv|xlsx|xls|txt)$/i)) {
      setError('Υποστηριζόμενα: JPG, PNG, HEIC, PDF, CSV, Excel'); return;
    }
    // Όριο μεγέθους: προστατεύει και την αποθήκευση και την πληρωμένη κλήση AI από
    // τεράστια αρχεία (το base64 φουσκώνει ~33%, οπότε 10MB ≈ 13MB payload).
    const MAX_FILE_MB = 10;
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`Το αρχείο είναι πολύ μεγάλο (${(f.size / 1048576).toFixed(1)}MB). Όριο ${MAX_FILE_MB}MB.`); return;
    }
    setFile(f);
    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target?.result as string;
      const base64 = dataUrl.split(',')[1];
      const mimeType = f.type || 'image/jpeg';
      setImage(dataUrl); setEdited(null); setError(''); setStep('review');
      scanDoc(base64, mimeType);
    };
    reader.readAsDataURL(f);
  }, []);

  const scanDoc = async (base64: string, mimeType: string) => {
    setScanning(true); setError('');
    const isPdf = mimeType === 'application/pdf';
    const contentPart = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } };

    const attempt = async (hint: string): Promise<{ doc?: ScannedDoc; err?: string }> => {
      const res = await fetch('/api/anthropic', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-5', max_tokens: 1500, system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: [contentPart, { type: 'text', text: `Αναγνώρισε και ανάλυσε αυτό το έγγραφο. ${hint}` }] }],
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) {
        return { err: String(data?.error || '').includes('ANTHROPIC_API_KEY') ? 'key_missing' : 'service' };
      }
      const text = (data.content || []).find((c: { type: string }) => c.type === 'text')?.text || '{}';
      try {
        const e = JSON.parse(text.replace(/```json?|```/g, '').trim()) as ScannedDoc;
        if (e && typeof e === 'object') return { doc: e };
      } catch { /* fallthrough */ }
      return { err: 'unreadable' };
    };

    const blank = (): ScannedDoc => ({ doc_type: 'other', confidence: 0 });
    try {
      let r = await attempt('Διάβασε κάθε στοιχείο με ακρίβεια.');
      if (r.err === 'unreadable') {
        r = await attempt('ΠΡΟΣΟΧΗ: η εικόνα ίσως είναι θαμπή ή στραβή. Κοίτα ξανά προσεκτικά και εντόπισε οπωσδήποτε τον τύπο του εγγράφου και τα βασικά στοιχεία.');
      }
      if (r.err) { setError(r.err); setEdited(blank()); return; }
      const doc = r.doc!;
      // Ντετερμινιστική εξομάλυνση αριθμών από το AI (μπορεί να δώσει strings) —
      // ώστε να μη σπάσει καμία αριθμητική στήλη στη βάση.
      const dref = doc as unknown as Record<string, unknown>;
      NUM_KEYS.forEach(k => { if (dref[k] != null) dref[k] = numify(dref[k]); });
      // Ντετερμινιστική επιδιόρθωση τύπου (ποτέ δεν εμπιστευόμαστε τυφλά το AI).
      doc.doc_type = classifyDocType(doc);
      if (typeof doc.confidence !== 'number') doc.confidence = 70;
      setEdited(doc);
    } catch {
      setError('unreadable'); setEdited(blank());
    } finally {
      setScanning(false);
    }
  };

  // Ανέβασμα του πρωτότυπου αρχείου στο Αρχείο (property_documents) — πάντα.
  const archiveFile = async (a: { category: string; note?: string; date?: string }, title?: string) => {
    if (!file) return false;
    const safe = file.name.replace(/[^\w.\-]+/g, '_');
    const path = `${userId}/${propertyId}/document/${Date.now()}_${safe}`;
    const { error: upErr } = await supabase.storage.from('property-files').upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (upErr) return false;
    const base = {
      property_id: propertyId, user_id: userId, kind: 'document', category: a.category,
      title: (title || file.name).slice(0, 200), notes: a.note || null,
      doc_date: a.date || null, file_path: path, file_name: file.name,
      mime: file.type || null, size_bytes: file.size,
    };
    const { error } = await supabase.from('property_documents').insert(base);
    return !error;
  };

  // Στρίψιμο null/undefined από payload — για ΕΝΗΜΕΡΩΣΗ ώστε να μη σβήνουμε
  // υπάρχοντα στοιχεία (π.χ. ενοικιαστή) με κενές τιμές από μερική ανάγνωση.
  const stripEmpty = (o: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== ''));
  const nrm = (s?: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

  const save = async () => {
    if (!edited) return;
    setSaving(true); setError('');
    const today = new Date().toISOString().split('T')[0];
    const plan = planDocSave(edited, today);
    const done: string[] = [];
    const add = (s: string) => { if (!done.includes(s)) done.push(s); };

    try {
      let billId: string | undefined;
      let reconciled = false;

      // 0) Πληρωμή: πρώτα προσπάθησε να εξοφλήσεις ΥΠΑΡΧΟΝΤΑ εκκρεμή λογαριασμό
      // (αποφυγή διπλοεγγραφής). Αν βρεθεί ταίρι, δεν δημιουργούμε νέο.
      if (plan.reconcile && edited.amount) {
        const cat = (plan.bill?.category as string) || 'other';
        const { data: pend } = await supabase.from('bills')
          .select('id,category,amount,due_date,created_at')
          .eq('property_id', propertyId).eq('paid', false);
        const match = matchBillToPayment(
          { amount: edited.amount, date: edited.issue_date || today, category: cat },
          (pend || []) as PendingBill[], new Set<string>());
        if (match) {
          await supabase.from('bills').update({ paid: true, paid_at: new Date().toISOString() }).eq('id', match.id);
          const { data: updExp } = await supabase.from('expenses').update({ paid: true }).eq('bill_id', match.id).select('id');
          await supabase.from('calendar_events').update({ status: 'paid' }).eq('bill_id', match.id);
          // Αν ο εξοφλημένος λογαριασμός δεν είχε συνδεδεμένο έξοδο (π.χ. μπήκε
          // χειροκίνητα αλλού), δημιούργησέ το τώρα ώστε η πληρωμή να φαίνεται.
          if ((!updExp || !updExp.length) && plan.expense) {
            const { error: expErr } = await supabase.from('expenses')
              .insert({ property_id: propertyId, user_id: userId, bill_id: match.id, ...plan.expense, paid: true });
            add(expErr ? 'Λογαριασμός εξοφλήθηκε' : 'Δαπάνες');
          } else { add('Δαπάνες'); }
          reconciled = true;
          add('Λογαριασμός εξοφλήθηκε');
        }
      }

      // 1) Λογαριασμός → bills (κρατάμε id για σύνδεση). Παραλείπεται αν έγινε συμφωνία.
      // ΔΕΝ κάνουμε throw: αν αποτύχει, συνεχίζουμε ώστε το έγγραφο να αρχειοθετηθεί.
      if (plan.bill && !reconciled) {
        const { data: billRow, error: billErr } = await supabase.from('bills')
          .insert({ property_id: propertyId, user_id: userId, ...plan.bill })
          .select('id').single();
        if (!billErr) { billId = billRow?.id as string | undefined; add('Λογαριασμοί'); }
      }

      // 2) Έξοδο → expenses (σύνδεση bill_id), με προστασία διπλοεγγραφής.
      // Το dedup λαμβάνει υπόψη και την περιγραφή ώστε δύο διαφορετικά έξοδα ίδιου
      // ποσού/ημέρας να μη μπερδεύονται· ταιριάζει μόνο εγγραφές από σάρωση.
      if (plan.expense && !reconciled) {
        const amt = plan.expense.amount as number;
        const cat = plan.expense.category as string;
        const d = plan.expense.date as string;
        const desc = plan.expense.description as string;
        const { data: dup } = await supabase.from('expenses').select('id,description')
          .eq('property_id', propertyId).eq('category', cat).eq('amount', amt).eq('date', d).limit(5);
        const isDup = (dup || []).some(x => nrm(x.description as string) === nrm(desc));
        if (isDup) { add('Δαπάνες (υπάρχει ήδη)'); }
        else {
          const { error: expErr } = await supabase.from('expenses')
            .insert({ property_id: propertyId, user_id: userId, bill_id: billId, ...plan.expense });
          if (!expErr) add('Δαπάνες');
        }
      }

      // 3) Ημερολόγιο → calendar_events (σύνδεση bill_id αν υπάρχει).
      if (plan.calendar && !reconciled) {
        for (const ev of plan.calendar) {
          const { error: cErr } = await supabase.from('calendar_events')
            .insert({ property_id: propertyId, user_id: userId, bill_id: billId, ...ev });
          if (!cErr) add('Ημερολόγιο');
        }
      }

      // 4) Ενοικιαστής → tenants. Αν υπάρχει ίδιος ενοικιαστής (ίδιο όνομα),
      // συμπληρώνουμε ΜΟΝΟ όσα πεδία έχουν τιμή (χωρίς να σβήνουμε τα υπάρχοντα).
      // Αν το όνομα διαφέρει, είναι νέος ενοικιαστής → νέα εγγραφή (διατηρείται το ιστορικό).
      if (plan.tenant) {
        const { data: existing } = await supabase.from('tenants').select('id,full_name')
          .eq('property_id', propertyId).eq('user_id', userId)
          .order('updated_at', { ascending: false }).limit(1);
        const cur = existing && existing.length ? existing[0] : null;
        const sameTenant = cur && nrm(cur.full_name as string) === nrm(plan.tenant.full_name as string);
        const q = sameTenant
          ? supabase.from('tenants').update(stripEmpty(plan.tenant)).eq('id', cur!.id)
          : supabase.from('tenants').insert({ property_id: propertyId, user_id: userId, ...stripEmpty(plan.tenant) });
        const { error: tErr } = await q;
        if (!tErr) add('Ενοικιαστής');
      }

      // 5) Στοιχεία ακινήτου → user_properties (ασφαλείς στήλες, αμυντικά).
      if (plan.property) {
        const { error: pErr } = await supabase.from('user_properties').update(plan.property).eq('id', propertyId);
        if (!pErr) add('Στοιχεία ακινήτου');
      }

      // 6) Ασφάλεια → property_settings (καρτέλα Ρυθμίσεις), αμυντικά.
      if (plan.settings) {
        const { error: sErr } = await supabase.from('property_settings')
          .upsert({ property_id: propertyId, user_id: userId, ...plan.settings }, { onConflict: 'property_id' });
        if (!sErr) add('Ασφάλεια');
      }

      // 7) Κοινόχρηστα → bills_settings section 'common'.
      if (plan.commonMonthAmount != null || plan.commonMillesimi != null) {
        const { data: cur } = await supabase.from('bills_settings').select('data')
          .eq('property_id', propertyId).eq('section', 'common').maybeSingle();
        const dd = (cur?.data as Record<string, unknown>) || {};
        const history = Array.isArray(dd.history) ? [...(dd.history as string[])] : Array(12).fill('');
        if (plan.commonMonthAmount != null) history[new Date().getMonth()] = String(plan.commonMonthAmount);
        const nextData = { ...dd, history, ...(plan.commonMillesimi != null && !dd.millesimi ? { millesimi: String(plan.commonMillesimi) } : {}) };
        const { error: kErr } = await supabase.from('bills_settings')
          .upsert({ property_id: propertyId, user_id: String(userId), section: 'common', data: nextData, updated_at: new Date().toISOString() }, { onConflict: 'property_id,section' });
        if (!kErr) add('Κοινόχρηστα');
      }

      // 8) Αρχειοθέτηση του πρωτότυπου — πάντα, ώστε τίποτα να μη χάνεται.
      if (plan.archive) {
        const ok = await archiveFile(plan.archive, edited.title || edited.provider);
        if (ok) add('Αρχείο');
      }

      // Ειλικρινής αναφορά: αν ΤΙΠΟΤΑ δεν αποθηκεύτηκε, μη λες ψέματα «Καταχωρήθηκε».
      if (!done.length) { setError('save'); return; }
      setSavedInfo(done);
      setStep('done');
      onSaved?.();
    } catch {
      setError('save');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setStep('upload'); setFile(null); setImage(''); setEdited(null);
    setSaving(false); setError(''); setSavedInfo([]); setNewField({ label: '', value: '' });
  };

  // ── Οθόνη επιτυχίας ─────────────────────────────────────────────────────────
  if (step === 'done' && edited) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 20px', fontFamily: T.font.sans }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(52,168,83,0.1)', border: '1px solid rgba(52,168,83,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="var(--positive)" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5" /></svg>
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6, letterSpacing: '-0.02em' }}>Καταχωρήθηκε</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 18 }}>{docSummaryLine(edited)}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
          {savedInfo.map(s => (
            <span key={s} style={{ fontSize: 11, fontWeight: 700, color: 'var(--positive)', background: 'rgba(52,168,83,0.1)', border: '1px solid rgba(52,168,83,0.25)', borderRadius: T.radius.pill, padding: '4px 12px', fontFamily: T.font.sans }}>✓ {s}</span>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 26 }}>Ενημερώθηκαν αυτόματα οι σχετικές καρτέλες.</div>
        <button onClick={reset} style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: T.radius.pill, padding: '11px 30px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: T.font.sans }}>Σάρωσε νέο έγγραφο</button>
      </div>
    );
  }

  const typeMeta = edited ? DOC_TYPES.find(t => t.id === edited.doc_type) : null;
  const v = edited ? validateDoc(edited) : { blocking: [], recommended: [] };
  const canSave = v.blocking.length === 0;

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>Πρόσθεσε ένα έγγραφο</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Φωτογράφισε ή ανέβασε <strong>οτιδήποτε</strong> — λογαριασμό, απόδειξη, μισθωτήριο, τίτλο, ασφάλεια, ΕΝΦΙΑ, κρατικό έγγραφο. Το αναγνωρίζουμε και το καταχωρούμε στο σωστό σημείο.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: step === 'review' && image ? 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))' : '1fr', gap: 20 }}>
        {/* Αριστερά: upload ή προεπισκόπηση */}
        <div>
          {step === 'upload' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: 12 }}>
              <div onClick={() => cameraRef.current?.click()}
                style={{ border: '1px solid var(--border-default)', borderRadius: T.radius.card, minHeight: 172, cursor: 'pointer', background: 'var(--bg-elevated)', transition: 'all 0.2s', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'rgba(26,115,232,0.03)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.background = 'var(--bg-elevated)'; }}>
                <svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Φωτογράφισε</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Κάμερα κινητού · tablet</div>
              </div>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && loadFile(e.target.files[0])} />

              <div onClick={() => fileRef.current?.click()}
                style={{ border: '1px solid var(--border-default)', borderRadius: T.radius.card, minHeight: 172, cursor: 'pointer', background: 'var(--bg-elevated)', transition: 'all 0.2s', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'rgba(26,115,232,0.03)'; }}
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
                <img src={image} alt="Έγγραφο" style={{ width: '100%', borderRadius: T.radius.card, border: '1px solid var(--border-subtle)', maxHeight: 480, objectFit: 'contain', background: '#fff' }} />
              )}
              {scanning && (
                <div style={{ marginTop: 12, background: 'rgba(26,115,232,0.06)', border: '1px solid rgba(26,115,232,0.2)', borderRadius: T.radius.inner, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}><strong style={{ color: 'var(--accent)' }}>Claude AI</strong> αναγνωρίζει το έγγραφο…</div>
                </div>
              )}
              <button onClick={reset} style={{ marginTop: 10, fontSize: 11, color: 'var(--text-tertiary)', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: T.radius.btn, padding: '6px 14px', cursor: 'pointer', fontFamily: T.font.sans }}>← Νέα σάρωση</button>

              {error && (() => {
                const title = error === 'unreadable' ? 'Δεν διάβασα καθαρά το έγγραφο'
                  : error === 'key_missing' ? 'Η αυτόματη ανάγνωση δεν είναι ενεργή ακόμη'
                  : error === 'save' ? 'Κάτι πήγε στραβά στην αποθήκευση'
                  : 'Η υπηρεσία ανάγνωσης δεν είναι διαθέσιμη τώρα';
                const tips = error === 'unreadable'
                  ? ['Τράβα τη φωτογραφία με καλό φως, ίσια, να χωράει όλο το έγγραφο', 'Αν έχεις PDF από τον πάροχο/φορέα, ανέβασέ το — διαβάζεται καλύτερα']
                  : error === 'key_missing' ? ['Συμπλήρωσε τα πεδία χειροκίνητα και αποθήκευσε κανονικά', 'Για αυτόματη ανάγνωση χρειάζεται το κλειδί AI στις ρυθμίσεις']
                  : error === 'save' ? ['Δοκίμασε ξανά — τα στοιχεία σου διατηρούνται']
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
            {/* Τύπος εγγράφου — chips για διόρθωση */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Τύπος εγγράφου {edited.confidence ? `· ${edited.confidence}% βεβαιότητα` : ''}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {DOC_TYPES.map(dt => {
                  const active = edited.doc_type === dt.id;
                  return (
                    <button key={dt.id} onClick={() => setEdited(p => p ? { ...p, doc_type: dt.id } : p)} title={dt.hint}
                      style={{ fontSize: 12, fontWeight: active ? 700 : 500, padding: '6px 12px', borderRadius: T.radius.pill, cursor: 'pointer', fontFamily: T.font.sans, border: `1px solid ${active ? 'var(--accent)' : 'var(--border-default)'}`, background: active ? 'var(--accent)' : 'transparent', color: active ? 'var(--accent-text)' : 'var(--text-secondary)', transition: 'all 0.15s' }}>
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

            {/* Προειδοποίηση ελλείψεων */}
            {(v.blocking.length > 0 || v.recommended.length > 0) && (
              <div style={{ background: v.blocking.length ? 'var(--warning-soft)' : 'var(--info-soft)', border: `1px solid ${v.blocking.length ? 'var(--warning-border)' : 'var(--info-border)'}`, borderRadius: T.radius.inner, padding: '10px 14px', marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                  {v.blocking.length
                    ? <>Χρειάζονται τα βασικά: <strong>{v.blocking.map(f => DOC_FIELD_LABELS[f] || f).join(', ')}</strong>. Συμπλήρωσέ τα για να αποθηκεύσω σωστά.</>
                    : <>Καλό θα ήταν να συμπληρώσεις: <strong>{v.recommended.map(f => DOC_FIELD_LABELS[f] || f).join(', ')}</strong>. Μπορείς και να αποθηκεύσεις έτσι.</>}
                </div>
              </div>
            )}

            {/* Πεδία ανά τύπο */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: 10 }}>
              {(edited.doc_type === 'bill' || edited.doc_type === 'payment') && (
                <div>
                  <label style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>Κατηγορία</label>
                  <select value={edited.category || 'other'} onChange={e => setEdited(p => p ? { ...p, category: e.target.value } : p)}
                    style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 6, padding: '9px 12px', color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: T.font.sans }}>
                    {Object.entries(CATEGORY_LABELS).map(([val, l]) => <option key={val} value={val}>{l}</option>)}
                  </select>
                </div>
              )}
              {TYPE_FIELDS[edited.doc_type].map(f => (
                <Field key={String(f.key)} label={f.label} type={f.type}
                  value={(edited[f.key] as string | number) ?? ''}
                  invalid={v.blocking.includes(String(f.key))}
                  onChange={val => setF(f.key, val)} />
              ))}
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
                      style={{ flex: '0 0 38%', background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 6, padding: '8px 10px', color: 'var(--text-primary)', fontSize: 12, fontFamily: T.font.sans }} />
                    <input value={c.value} placeholder="Τιμή" onChange={e => setEdited(p => { if (!p) return p; const cs = [...(p.custom || [])]; cs[i] = { ...cs[i], value: e.target.value }; return { ...p, custom: cs }; })}
                      style={{ flex: 1, background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 6, padding: '8px 10px', color: 'var(--text-primary)', fontSize: 12, fontFamily: T.font.sans }} />
                    <button onClick={() => setEdited(p => p ? { ...p, custom: (p.custom || []).filter((_, j) => j !== i) } : p)} title="Αφαίρεση"
                      style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer' }}>×</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
              <input value={newField.label} placeholder="Νέο πεδίο (π.χ. Αρ. πρωτοκόλλου)" onChange={e => setNewField(f => ({ ...f, label: e.target.value }))}
                style={{ flex: '0 0 38%', background: 'var(--bg-base)', border: '1px dashed var(--border-default)', borderRadius: 6, padding: '8px 10px', color: 'var(--text-primary)', fontSize: 12, fontFamily: T.font.sans }} />
              <input value={newField.value} placeholder="Τιμή" onChange={e => setNewField(f => ({ ...f, value: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter' && newField.label.trim()) { setEdited(p => p ? { ...p, custom: [...(p.custom || []), { ...newField }] } : p); setNewField({ label: '', value: '' }); } }}
                style={{ flex: 1, background: 'var(--bg-base)', border: '1px dashed var(--border-default)', borderRadius: 6, padding: '8px 10px', color: 'var(--text-primary)', fontSize: 12, fontFamily: T.font.sans }} />
              <button onClick={() => { if (newField.label.trim()) { setEdited(p => p ? { ...p, custom: [...(p.custom || []), { ...newField }] } : p); setNewField({ label: '', value: '' }); } }}
                title="Προσθήκη πεδίου" style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 6, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--accent)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>+</button>
            </div>

            {/* Αποθήκευση */}
            <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '14px 16px', border: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{typeMeta?.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                  {edited.amount ? fe(edited.amount) : edited.monthly_rent ? `${fe(edited.monthly_rent)}/μ` : edited.premium ? fe(edited.premium) : '—'}
                </div>
              </div>
              <button onClick={save} disabled={saving || !canSave}
                style={{ background: canSave ? 'var(--accent)' : 'var(--bg-elevated)', color: canSave ? 'var(--accent-text)' : 'var(--text-tertiary)', border: canSave ? 'none' : '1px solid var(--border-default)', borderRadius: T.radius.btn, padding: '12px 24px', fontSize: 13, fontWeight: 700, cursor: canSave ? 'pointer' : 'not-allowed', fontFamily: T.font.sans, whiteSpace: 'nowrap' }}>
                {saving ? 'Αποθήκευση…' : !canSave ? 'Συμπλήρωσε τα βασικά' : 'Καταχώρηση →'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
