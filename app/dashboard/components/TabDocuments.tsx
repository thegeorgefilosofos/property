'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, fd, fe, fn, KPIGrid, Spinner, EmptyState, InfoBanner, PageTitle, SecHdr, Badge, Btn, ExportButton } from '@/components/Theme';
import { CustomSelect, TextInput, DatePicker, Textarea } from './UIComponents';
import { downloadCsv } from './exportCsv';
import { useAppPreferences } from './useAppPreferences';
// Επαναχρησιμοποίηση του ΥΠΑΡΧΟΝΤΟΣ pipeline OCR/ταξινόμησης (DocumentScan + lib/billing)
// για αυτόματη αναγνώριση & αρχειοθέτηση κατά το bulk upload — καμία νέα λογική OCR.
import { classifyDocType, planDocSave, type ScannedDoc } from '@/lib/billing/documents';
import { SYSTEM_PROMPT } from './DocumentScan';

/* ════════════════════════════════════════════════════════════════════════
   ΑΡΧΕΙΟ — ένας πλήρως οργανωμένος ψηφιακός φάκελος (Google-Drive class).
   Συγκεντρώνει σε ΕΝΑ σημείο έγγραφα από πολλές πηγές, αυτόματα ταξινομημένα
   σε φακέλους ανά κατηγορία → πάροχο ή ημερομηνία → αρχείο (2 κλικ).
   Πηγές δεδομένων:
     • property_documents  — τα ανεβασμένα αρχεία/φωτογραφίες (μοναδική εγγράψιμη πηγή)
     • expenses.attachment_url — αποδείξεις/τιμολόγια που επισυνάφθηκαν στα Έξοδα
     • bills               — λογαριασμοί (χωρίς αρχείο· εικονική καρτέλα ανά πάροχο/ημ/αξία)
     • inventory_items     — εγγυήσεις εξοπλισμού (με φωτογραφία προϊόντος όπου υπάρχει)
   ════════════════════════════════════════════════════════════════════════ */

// Έξυπνη πρόταση κατηγορίας εγγράφου βάσει του παρόχου που πληκτρολογεί ο χρήστης
const SUPPLIER_CATEGORY_RULES: { re: RegExp; cat: string }[] = [
  { re: /ΕΥΔΑΠ|ΕΥΑΘ|ΔΕΥΑ|νερ[όο]/i,                                     cat: 'Λογαριασμός Νερού' },
  { re: /φυσικ[όο]\s*αέριο|ΔΕΠΑ|fysiko|αερίου/i,                          cat: 'Λογαριασμός Φυσικού Αερίου' },
  { re: /cosmote|vodafone|nova|wind|forthnet|internet|τηλέφων/i,          cat: 'Τηλέφωνο / Internet' },
  { re: /hellas\s*direct|interamerican|magenta|ergo|allianz|anytime|generali|ασφάλ|ασφαλιστ/i, cat: 'Ασφαλιστήριο Συμβόλαιο' },
  { re: /απεντόμω|μυοκτον|απολύμαν/i,                                     cat: 'Απεντόμωση / Μυοκτονία' },
  { re: /καθαρισμ/i,                                                       cat: 'Τιμολόγιο Καθαρισμού' },
  { re: /πισίν/i,                                                          cat: 'Συντήρηση Πισίνας' },
  { re: /ανελκυστ|ασανσέρ/i,                                               cat: 'Συντήρηση Ανελκυστήρα' },
  { re: /security|ασφαλεία|φύλαξ/i,                                        cat: 'Εταιρεία Ασφαλείας' },
  { re: /κοινόχρηστ|διαχείρισ/i,                                           cat: 'Κοινόχρηστα' },
  { re: /ΕΝΦΙΑ|ΑΑΔΕ|φόρο|φορολ/i,                                          cat: 'ΕΝΦΙΑ / Φορολογικά' },
  { re: /ΔΕΗ|protergia|ήρων|ηρων|heron|nrg|elin|ελίν|volton|enerwave|zenith|ζενίθ|ρεύμα|ρευμα/i, cat: 'Λογαριασμός Ρεύματος' },
];
const suggestCategory = (supplier: string): string | null => {
  const s = supplier.trim();
  if (!s) return null;
  return SUPPLIER_CATEGORY_RULES.find(r => r.re.test(s))?.cat ?? null;
};

// Χαρτογράφηση της κατηγορίας λογαριασμού που εξάγει το OCR (electricity, water…)
// στην αντίστοιχη κατηγορία-φάκελο του Αρχείου, ώστε π.χ. φωτογραφημένος
// λογαριασμός ΔΕΗ να αρχειοθετείται μόνος του στο «Λογαριασμός Ρεύματος» → πάροχος.
// Ό,τι δεν αντιστοιχίζεται εδώ πέφτει σε suggestCategory(πάροχος) → «Άλλο Έγγραφο».
const SCAN_CAT_TO_DOC_CATEGORY: Record<string, string> = {
  electricity: 'Λογαριασμός Ρεύματος',
  water:       'Λογαριασμός Νερού',
  gas:         'Λογαριασμός Φυσικού Αερίου',
  internet:    'Τηλέφωνο / Internet',
  common:      'Κοινόχρηστα',
  insurance:   'Ασφαλιστήριο Συμβόλαιο',
  taxes:       'ΕΝΦΙΑ / Φορολογικά',
  municipal:   'ΕΝΦΙΑ / Φορολογικά',
  security:    'Εταιρεία Ασφαλείας',
  elevator:    'Συντήρηση Ανελκυστήρα',
  pool:        'Συντήρηση Πισίνας',
  cleaner:     'Τιμολόγιο Καθαρισμού',
};

interface Props { propertyId: string; userId: string; }

interface DocRow {
  id: string; property_id: string; kind: 'photo' | 'document';
  category: string | null; supplier: string | null; title: string | null; notes: string | null;
  doc_date: string | null; file_path: string; file_name: string | null;
  mime: string | null; size_bytes: number | null; created_at: string;
  signedUrl?: string;
}

// Κατηγορίες φωτογραφιών, τεκμηρίωση κατάστασης ακινήτου
const PHOTO_CATEGORIES = [
  'Κατάσταση Ακινήτου', 'Πριν την Παράδοση', 'Μετά την Παράδοση',
  'Ζημιά / Φθορά', 'Ανακαίνιση', 'Εξωτερικοί Χώροι', 'Άλλο',
];

// Κατηγορίες εγγράφων, αρχείο λογαριασμών, συμβολαίων, τιμολογίων
const DOC_CATEGORIES = [
  'Μισθωτήριο / Συμβόλαιο', 'Ασφαλιστήριο Συμβόλαιο',
  'ΕΝΦΙΑ / Φορολογικά', 'Τεχνική Έκθεση',
  'Λογαριασμός Ρεύματος', 'Λογαριασμός Φυσικού Αερίου', 'Λογαριασμός Νερού',
  'Τηλέφωνο / Internet', 'Κοινόχρηστα',
  'Απεντόμωση / Μυοκτονία', 'Τιμολόγιο Καθαρισμού', 'Συντήρηση Πισίνας',
  'Συντήρηση Ανελκυστήρα', 'Εταιρεία Ασφαλείας', 'Άλλο Έγγραφο',
];

// Συνήθεις πάροχοι, προτάσεις (ελεύθερη πληκτρολόγηση για οποιονδήποτε άλλο)
const COMMON_SUPPLIERS = [
  'ΔΕΗ', 'Protergia', 'ΗΡΩΝ', 'NRG', 'Elin', 'Volton', 'enerwave', 'Zenith',
  'Φυσικό Αέριο Ελλάδος', 'ΕΥΔΑΠ', 'ΕΥΑΘ', 'ΔΕΥΑ',
  'COSMOTE', 'Vodafone', 'Nova', 'Wind',
  'Hellas Direct', 'Interamerican', 'Anytime', 'Magenta Insurance', 'Ergo', 'Allianz',
  'Διαχείριση Πολυκατοικίας', 'Συνεργείο Καθαρισμού', 'Συντήρηση Ανελκυστήρα', 'Εταιρεία Ασφαλείας',
];

/* ── Ταξινόμηση φακέλων ─────────────────────────────────────────────────── */
type FolderKey =
  | 'contracts' | 'property' | 'taxes' | 'bills' | 'providers'
  | 'warranties' | 'invoices' | 'bank' | 'photos' | 'other';

const FOLDERS: { key: FolderKey; label: string }[] = [
  { key: 'contracts',  label: 'Συμβόλαια' },
  { key: 'property',   label: 'Έγγραφα ακινήτου' },
  { key: 'taxes',      label: 'Φόροι & ΕΝΦΙΑ' },
  { key: 'bills',      label: 'Λογαριασμοί' },
  { key: 'providers',  label: 'Πάροχοι' },
  { key: 'warranties', label: 'Εγγυήσεις' },
  { key: 'invoices',   label: 'Τιμολόγια' },
  { key: 'bank',       label: 'Τραπεζικά' },
  { key: 'photos',     label: 'Φωτογραφίες' },
  { key: 'other',      label: 'Λοιπά' },
];
const FOLDER_LABEL: Record<FolderKey, string> = FOLDERS.reduce((a, f) => { a[f.key] = f.label; return a; }, {} as Record<FolderKey, string>);

// Ακριβής αντιστοίχιση κατηγορίας property_documents → φάκελος
const DOC_CAT_FOLDER: Record<string, FolderKey> = {
  'Μισθωτήριο / Συμβόλαιο': 'contracts', 'Ασφαλιστήριο Συμβόλαιο': 'contracts',
  'ΕΝΦΙΑ / Φορολογικά': 'taxes', 'Τεχνική Έκθεση': 'property', 'Άλλο Έγγραφο': 'property',
  'Λογαριασμός Ρεύματος': 'bills', 'Λογαριασμός Φυσικού Αερίου': 'bills', 'Λογαριασμός Νερού': 'bills',
  'Τηλέφωνο / Internet': 'bills', 'Κοινόχρηστα': 'bills',
  'Απεντόμωση / Μυοκτονία': 'providers', 'Τιμολόγιο Καθαρισμού': 'providers',
  'Συντήρηση Πισίνας': 'providers', 'Συντήρηση Ανελκυστήρα': 'providers', 'Εταιρεία Ασφαλείας': 'providers',
};
const folderForDoc = (cat: string | null): FolderKey => {
  if (!cat) return 'property';
  if (DOC_CAT_FOLDER[cat]) return DOC_CAT_FOLDER[cat];
  const c = cat.toLowerCase();
  if (/ασφαλ|συμβόλαιο|μισθωτ/.test(c)) return 'contracts';
  if (/ενφια|φόρο|φορολ/.test(c)) return 'taxes';
  if (/λογαριασμ|ρεύμα|νερ|αέριο|internet|τηλέφων|κοινόχρηστ/.test(c)) return 'bills';
  if (/καθαρ|πισίν|ανελκυστ|απεντόμ|security|ασφαλεία/.test(c)) return 'providers';
  return 'property';
};
// Κατηγορία εξόδου (ελεύθερο ελληνικό string) → φάκελος
const folderForExpense = (cat: string | null): FolderKey => {
  const c = (cat || '').toLowerCase();
  if (/ενφια|enfia|φόρο|φορολ|δημοτικ/.test(c)) return 'taxes';
  if (/δόση\s*δαν|δανε|τραπεζ|loan/.test(c)) return 'bank';
  return 'invoices';
};
// Κατηγορία bill (english key) → φάκελος
const BILL_CAT_FOLDER: Record<string, FolderKey> = {
  electricity: 'bills', water: 'bills', gas: 'bills', internet: 'bills', common: 'bills', streaming: 'bills', other: 'bills',
  enfia: 'taxes', dimotika: 'taxes', insurance: 'contracts',
  security: 'providers', cleaning: 'providers', garden: 'providers', pool: 'providers',
  elevator: 'providers', ac_service: 'providers', pest: 'providers', renovation: 'providers',
};
// Ομαδοποίηση λογαριασμών «ανά πάροχο»: κατηγορία → σταθερή ετικέτα (όχι το μοναδικό
// όνομα κάθε λογαριασμού, που θα δημιουργούσε έναν υποφάκελο ανά λογαριασμό).
const BILL_PROVIDER_LABEL: Record<string, string> = {
  electricity: 'Ρεύμα', water: 'Νερό', gas: 'Φυσικό Αέριο', internet: 'Internet & Τηλεφωνία',
  common: 'Κοινόχρηστα', streaming: 'Συνδρομές', enfia: 'ΕΝΦΙΑ', dimotika: 'Δημοτικά Τέλη',
  insurance: 'Ασφάλεια', security: 'Ασφάλεια & Φύλαξη', cleaning: 'Καθαρισμός',
  garden: 'Κήπος', pool: 'Πισίνα', elevator: 'Ανελκυστήρας', ac_service: 'Κλιματισμός',
  pest: 'Απεντόμωση', renovation: 'Ανακαίνιση', other: 'Λοιπά',
};

/* ── Ενοποιημένο μοντέλο αρχείου ─────────────────────────────────────────── */
type Source = 'document' | 'expense' | 'bill' | 'inventory';
interface Item {
  id: string;
  source: Source;
  folder: FolderKey;
  title: string;
  provider: string | null;
  date: string | null;   // ISO
  value: number | null;  // €
  url: string | null;    // openable (signed ή external)
  isImage: boolean;
  sizeBytes: number | null;
  note: string | null;
  category: string | null;
  raw?: DocRow;          // μόνο για διαγραφή property_documents
}
const ORIGIN_LABEL: Record<Source, string | null> = { document: null, expense: 'Έξοδα', bill: 'Λογαριασμοί', inventory: 'Απογραφή' };

/* ── Ουρά bulk upload (per-file πρόοδος) ─────────────────────────────────── */
type UploadStatus = 'pending' | 'ocr' | 'uploading' | 'done' | 'error';
interface UploadTask { id: string; name: string; status: UploadStatus; label?: string }
// Πρόταση κατηγορίας-φακέλου από ΤΟ ΙΔΙΟ αποτέλεσμα OCR/ταξινόμησης του DocumentScan.
interface AutoFile { category: string; supplier: string | null; doc_date: string | null; title: string | null }

const fmtSize = (b: number | null) => {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
};
const yearOf = (d: string | null) => (d ? String(new Date(d).getFullYear()) : null);
const monthLabel = (d: string) => new Date(d).toLocaleDateString('el-GR', { month: 'long', year: 'numeric' });

/* ── Εικονίδια (inline SVG, stroke=currentColor) ─────────────────────────── */
const S = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const FolderGlyph = ({ k, size = 22 }: { k: FolderKey; size?: number }) => {
  const p: Record<FolderKey, React.ReactNode> = {
    contracts:  <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M9 14h6M9 17h4"/></>,
    property:   <><path d="M3 10.5 12 4l9 6.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-5h4v5"/></>,
    taxes:      <><path d="M3 21h18"/><path d="M5 21V10l7-5 7 5v11"/><path d="M9 21v-6h6v6"/></>,
    bills:      <><path d="M6 2h9l3 3v17l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h3"/></>,
    providers:  <><path d="M14.5 5.5a3.5 3.5 0 0 1-4.9 4.9L4 16v4h4l5.6-5.6a3.5 3.5 0 0 0 4.9-4.9l-2.3 2.3-2-2z"/></>,
    warranties: <><path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z"/><path d="M9 12l2 2 4-4"/></>,
    invoices:   <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></>,
    bank:       <><path d="M3 10 12 4l9 6"/><path d="M5 10v8M10 10v8M14 10v8M19 10v8"/><path d="M3 21h18"/></>,
    photos:     <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5-4 4 3 3-2 4 3"/></>,
    other:      <><path d="M4 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">{p[k]}</svg>;
};

export default function TabDocuments({
  propertyId, userId, embedded, profileType = 'individual',
}: Props & { embedded?: boolean; profileType?: 'individual' | 'professional' }) {
  const supabase = createClient();
  const { prefs } = useAppPreferences(propertyId);
  const isPro = profileType === 'professional';

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [colWarn, setColWarn] = useState(false); // αν λείπει το attachment_url στα expenses

  // Πλοήγηση φακέλων
  const [folderKey, setFolderKey] = useState<FolderKey | null>(null);
  const [subKey, setSubKey] = useState<string | null>(null);
  const [subMode, setSubMode] = useState<'provider' | 'date'>('provider');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [lightbox, setLightbox] = useState<Item | null>(null);

  // Ανέβασμα
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [form, setForm] = useState({ kind: 'document' as 'photo' | 'document', category: DOC_CATEGORIES[0], supplier: '', title: '', doc_date: '', notes: '' });
  const [autoDetect, setAutoDetect] = useState(true);   // αυτόματη αναγνώριση/αρχειοθέτηση (AI)
  const [dragOver, setDragOver] = useState(false);
  const [queue, setQueue] = useState<UploadTask[]>([]);  // per-file πρόοδος bulk upload
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchAll = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    const [docsRes, expRes, billsRes, invRes] = await Promise.all([
      supabase.from('property_documents').select('*').eq('property_id', propertyId).order('created_at', { ascending: false }),
      supabase.from('expenses').select('*').eq('property_id', propertyId),
      supabase.from('bills').select('*').eq('property_id', propertyId),
      supabase.from('inventory_items').select('*').eq('property_id', propertyId),
    ]);

    const docs = (docsRes.data ?? []) as DocRow[];
    // Υπογεγραμμένα URL για τα ανεβασμένα αρχεία (bucket property-files)
    const paths = docs.map(r => r.file_path).filter(Boolean);
    const signedMap: Record<string, string> = {};
    if (paths.length) {
      const { data: signed } = await supabase.storage.from('property-files').createSignedUrls(paths, 60 * 60 * 24);
      signed?.forEach((s, i) => { if (s?.signedUrl) signedMap[paths[i]] = s.signedUrl; });
    }

    const out: Item[] = [];

    // 1) property_documents — πρωτογενή αρχεία & φωτογραφίες
    docs.forEach(r => {
      const img = (r.mime || '').startsWith('image/');
      out.push({
        id: `doc:${r.id}`, source: 'document',
        folder: r.kind === 'photo' ? 'photos' : folderForDoc(r.category),
        title: r.title || r.file_name || 'Έγγραφο',
        provider: r.supplier, date: r.doc_date || r.created_at, value: null,
        url: signedMap[r.file_path] ?? null, isImage: img, sizeBytes: r.size_bytes,
        note: r.notes, category: r.category, raw: { ...r, signedUrl: signedMap[r.file_path] },
      });
    });

    // 2) expenses με επισυναπτόμενο αρχείο (πραγματικές αποδείξεις/τιμολόγια)
    const exp = (expRes.data ?? []) as any[];
    const hasAttachCol = exp.length === 0 || exp.some(e => 'attachment_url' in e);
    setColWarn(exp.length > 0 && !hasAttachCol);
    exp.forEach(e => {
      const url = e.attachment_url as string | undefined;
      if (!url) return; // προτίμηση σε πραγματικά συνημμένα
      out.push({
        id: `exp:${e.id}`, source: 'expense',
        folder: folderForExpense(e.category),
        title: e.description || 'Απόδειξη', provider: e.store_vendor || null,
        date: e.date || e.created_at || null, value: typeof e.amount === 'number' ? e.amount : (e.amount ? parseFloat(e.amount) : null),
        url, isImage: /\.(png|jpe?g|webp|gif|heic)$/i.test(url), sizeBytes: null,
        note: e.notes || null, category: e.category || null,
      });
    });

    // 3) bills — εικονικές καρτέλες λογαριασμών (χωρίς αρχείο· ανά πάροχο/ημ/αξία)
    const bills = (billsRes.data ?? []) as any[];
    bills.forEach(b => {
      out.push({
        id: `bill:${b.id}`, source: 'bill',
        folder: BILL_CAT_FOLDER[b.category] ?? 'bills',
        title: b.name || 'Λογαριασμός', provider: BILL_PROVIDER_LABEL[b.category] || 'Λοιποί λογαριασμοί',
        date: b.due_date || b.created_at || null,
        value: typeof b.amount === 'number' ? b.amount : (b.amount ? parseFloat(b.amount) : null),
        url: null, isImage: false, sizeBytes: null,
        note: [b.period, b.paid ? 'Πληρωμένος' : 'Σε εκκρεμότητα'].filter(Boolean).join(' · ') || null,
        category: b.category || null,
      });
    });

    // 4) inventory_items — εγγυήσεις εξοπλισμού
    const inv = (invRes.data ?? []) as any[];
    inv.forEach(i => {
      if (!i.warranty_expiry && !i.photo_url) return;
      const photo = i.photo_url || (Array.isArray(i.photos) ? i.photos[0] : null) || null;
      out.push({
        id: `inv:${i.id}`, source: 'inventory', folder: 'warranties',
        title: [i.name, i.brand].filter(Boolean).join(' · ') || 'Εξοπλισμός',
        provider: i.store_vendor || i.brand || null,
        date: i.purchase_date || null,
        value: typeof i.purchase_value === 'number' ? i.purchase_value : null,
        url: photo, isImage: !!photo, sizeBytes: null,
        note: [i.warranty_expiry ? `Εγγύηση έως ${fd(i.warranty_expiry)}` : null, i.receipt_number ? `Απόδειξη ${i.receipt_number}` : null].filter(Boolean).join(' · ') || null,
        category: i.category || null,
      });
    });

    setItems(out);
    setLoading(false);
  }, [propertyId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => {
    setForm(f => ({ ...f, category: (f.kind === 'photo' ? PHOTO_CATEGORIES : DOC_CATEGORIES)[0] }));
  }, [form.kind]);

  /* ── Ανέβασμα (γράφει στο property_documents) ─────────────────────────── */
  const autoOn = autoDetect && form.kind === 'document';

  // Ένα αρχείο → storage + εγγραφή στο property_documents. Ίδια αμυντική λογική με
  // τη χειροκίνητη ροή & το DocumentScan (retry χωρίς supplier σε παλιότερη βάση).
  const insertDoc = async (
    file: File,
    meta: { kind: 'photo' | 'document'; category: string; supplier: string | null; title: string; doc_date: string | null; notes: string | null },
  ): Promise<string | null> => {
    const safe = file.name.replace(/[^\w.\-]+/g, '_');
    const path = `${userId}/${propertyId}/${meta.kind}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${safe}`;
    const { error: upErr } = await supabase.storage.from('property-files').upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (upErr) return upErr.message;
    const base = {
      property_id: propertyId, user_id: userId, kind: meta.kind, category: meta.category,
      title: (meta.title || file.name).slice(0, 200), notes: meta.notes,
      doc_date: meta.doc_date || null, file_path: path, file_name: file.name,
      mime: file.type || null, size_bytes: file.size,
    };
    let { error: insErr } = await supabase.from('property_documents').insert({ ...base, supplier: meta.supplier });
    if (insErr && /supplier/i.test(insErr.message)) ({ error: insErr } = await supabase.from('property_documents').insert(base));
    return insErr ? insErr.message : null;
  };

  // Auto-OCR: επαναχρησιμοποιεί ΑΚΡΙΒΩΣ το ίδιο pipeline με το DocumentScan —
  // ίδιο /api/anthropic + SYSTEM_PROMPT, ίδια classifyDocType()/planDocSave().
  // Επιστρέφει πρόταση κατηγορίας-φακέλου/παρόχου/ημερομηνίας, ή null (→ εφεδρική
  // κατηγορία). Μόνο για εικόνες/PDF — ποτέ δεν μπλοκάρει το ανέβασμα.
  const ocrClassify = async (file: File): Promise<AutoFile | null> => {
    const isPdf = file.type === 'application/pdf';
    const isImage = file.type.startsWith('image/');
    if (!isImage && !isPdf) return null;                       // μη-έγγραφα: χωρίς OCR
    if (file.size > 10 * 1024 * 1024) return null;             // >10MB: χωρίς OCR (κόστος/latency)
    try {
      const dataUrl: string = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string); r.onerror = () => rej(new Error('read'));
        r.readAsDataURL(file);
      });
      const base64 = dataUrl.split(',')[1];
      if (!base64) return null;
      const contentPart: Record<string, unknown> = isPdf
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
        : { type: 'image', source: { type: 'base64', media_type: file.type || 'image/jpeg', data: base64 } };
      const res = await fetch('/api/anthropic', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-5', max_tokens: 1500, system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: [contentPart, { type: 'text', text: 'Αναγνώρισε και ανάλυσε αυτό το έγγραφο. Διάβασε κάθε στοιχείο με ακρίβεια.' }] }],
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) return null;
      const text = (data.content || []).find((c: { type: string }) => c.type === 'text')?.text || '{}';
      const doc = JSON.parse(text.replace(/```json?|```/g, '').trim()) as ScannedDoc;
      if (!doc || typeof doc !== 'object') return null;
      doc.doc_type = classifyDocType(doc);                     // ντετερμινιστική επιδιόρθωση τύπου
      const a = planDocSave(doc, new Date().toISOString().split('T')[0]).archive; // ίδιο σχέδιο αρχειοθέτησης
      if (!a) return null;
      // Οι λογαριασμοί μπαίνουν στη συγκεκριμένη κατηγορία-φάκελο (Ρεύμα, Νερό…),
      // όχι στο γενικό «Άλλο Έγγραφο» που δίνει το DOC_ARCHIVE_CATEGORY.
      const category = (doc.doc_type === 'bill' || doc.doc_type === 'payment')
        ? (SCAN_CAT_TO_DOC_CATEGORY[doc.category || ''] || suggestCategory(doc.provider || '') || a.category)
        : a.category;
      return { category, supplier: a.supplier || null, doc_date: a.date || null, title: doc.title || doc.provider || null };
    } catch { return null; }
  };

  // Bulk: ουρά με per-file πρόοδο. Ακολουθιακή επεξεργασία (concurrency 1) ώστε να
  // μη φουσκώνει το κόστος/latency των AI κλήσεων ούτε να πιέζεται η βάση.
  const handleFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (!files.length || !propertyId || uploading) return;
    setMsg(null); setUploading(true);
    const tasks: UploadTask[] = files.map((f, i) => ({ id: `${Date.now()}_${i}_${f.name}`, name: f.name, status: 'pending' }));
    setQueue(tasks);
    const upd = (id: string, patch: Partial<UploadTask>) => setQueue(q => q.map(t => (t.id === id ? { ...t, ...patch } : t)));
    let ok = 0, fail = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i]; const id = tasks[i].id;
      // Βάση = χειροκίνητα πεδία (λειτουργούν ως εφεδρική κατηγορία/override).
      let meta = {
        kind: form.kind, category: form.category, supplier: form.supplier.trim() || null,
        title: form.title.trim(), doc_date: form.doc_date || null, notes: form.notes.trim() || null,
      };
      if (autoOn) {
        upd(id, { status: 'ocr' });
        const auto = await ocrClassify(file);
        if (auto) {
          meta = {
            ...meta, kind: 'document', category: auto.category,
            supplier: auto.supplier ?? meta.supplier,
            doc_date: auto.doc_date ?? meta.doc_date,
            title: meta.title || auto.title || '',
          };
        }
        // Αν το OCR απέτυχε/μη-αναγνώσιμο: κρατάμε την εφεδρική χειροκίνητη κατηγορία.
      }
      upd(id, { status: 'uploading' });
      const err = await insertDoc(file, meta);
      if (err) { fail++; upd(id, { status: 'error' }); }
      else { ok++; upd(id, { status: 'done', label: [meta.category, meta.supplier].filter(Boolean).join(' · ') }); }
    }

    setUploading(false);
    setForm(f => ({ ...f, title: '', notes: '', doc_date: '' }));
    setMsg(ok === 0
      ? { text: 'Αποτυχία αρχειοθέτησης, δοκίμασε ξανά', error: true }
      : { text: fail ? `${ok} αρχειοθετήθηκαν · ${fail} απέτυχαν` : ok === 1 ? 'Το αρχείο αρχειοθετήθηκε' : `${ok} αρχεία αρχειοθετήθηκαν`, error: false });
    fetchAll();
    setTimeout(() => { setQueue([]); setMsg(null); }, 5000);
  };

  const del = async (it: Item) => {
    if (!it.raw) return;
    if (prefs.confirmBeforeDelete && !window.confirm('Να διαγραφεί οριστικά αυτό το αρχείο;')) return;
    await supabase.storage.from('property-files').remove([it.raw.file_path]);
    await supabase.from('property_documents').delete().eq('id', it.raw.id);
    if (lightbox?.id === it.id) setLightbox(null);
    fetchAll();
  };

  /* ── Παράγωγα δεδομένα ─────────────────────────────────────────────────── */
  const counts = useMemo(() => {
    const c: Record<string, number> = {}; const v: Record<string, number> = {};
    items.forEach(i => { c[i.folder] = (c[i.folder] || 0) + 1; if (i.value) v[i.folder] = (v[i.folder] || 0) + i.value; });
    return { count: c, value: v };
  }, [items]);

  const q = query.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!q) return null;
    return items.filter(i =>
      (i.title || '').toLowerCase().includes(q) ||
      (i.provider || '').toLowerCase().includes(q) ||
      (i.category || '').toLowerCase().includes(q) ||
      (i.note || '').toLowerCase().includes(q) ||
      FOLDER_LABEL[i.folder].toLowerCase().includes(q)
    ).sort(byDateDesc);
  }, [items, q]);

  const folderItems = useMemo(() => folderKey ? items.filter(i => i.folder === folderKey).sort(byDateDesc) : [], [items, folderKey]);
  const providersInFolder = useMemo(() => Array.from(new Set(folderItems.map(i => i.provider).filter(Boolean))) as string[], [folderItems]);

  // Υποφάκελοι (ανά πάροχο ή ανά έτος)
  const subfolders = useMemo(() => {
    const map = new Map<string, Item[]>();
    folderItems.forEach(i => {
      const key = subMode === 'provider'
        ? (i.provider || 'Χωρίς πάροχο')
        : (yearOf(i.date) || 'Χωρίς ημερομηνία');
      (map.get(key) ?? map.set(key, []).get(key)!).push(i);
    });
    const entries = Array.from(map.entries());
    // Ταξινόμηση: έτη φθίνουσα, πάροχοι αλφαβητικά, «χωρίς» στο τέλος
    entries.sort((a, b) => {
      const an = /Χωρίς/.test(a[0]) ? 1 : 0, bn = /Χωρίς/.test(b[0]) ? 1 : 0;
      if (an !== bn) return an - bn;
      if (subMode === 'date') return b[0].localeCompare(a[0]);
      return a[0].localeCompare(b[0], 'el');
    });
    return entries;
  }, [folderItems, subMode]);

  const subItems = useMemo(() => {
    if (subKey == null) return [];
    return folderItems.filter(i => {
      const key = subMode === 'provider' ? (i.provider || 'Χωρίς πάροχο') : (yearOf(i.date) || 'Χωρίς ημερομηνία');
      return key === subKey;
    });
  }, [folderItems, subKey, subMode]);

  const openFolder = (k: FolderKey) => {
    const hasProv = items.some(i => i.folder === k && i.provider);
    setSubMode(hasProv ? 'provider' : 'date');
    setFolderKey(k); setSubKey(null);
  };

  /* ── UI helpers ────────────────────────────────────────────────────────── */
  const crumb = (label: string, onClick?: () => void, last = false) => (
    <>
      <button onClick={onClick} disabled={!onClick || last}
        style={{ background: 'none', border: 'none', padding: 0, cursor: onClick && !last ? 'pointer' : 'default',
          fontSize: 13, fontWeight: last ? 700 : 500, fontFamily: T.font.sans,
          color: last ? 'var(--text-primary)' : 'var(--accent)' }}>{label}</button>
    </>
  );
  const sep = <svg {...S} width={14} height={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}><path d="m9 18 6-6-6-6"/></svg>;

  const totalValue = items.reduce((s, i) => s + (i.value || 0), 0);
  const photoCount = items.filter(i => i.folder === 'photos').length;
  const docCount = items.length - photoCount;
  const activeCategories = FOLDERS.filter(f => counts.count[f.key]).length;

  const exportCsv = () => downloadCsv('archeio.csv',
    ['Όνομα', 'Φάκελος', 'Πάροχος', 'Ημερομηνία', 'Αξία (€)', 'Πηγή'],
    items.slice().sort(byDateDesc).map(i => [
      i.title, FOLDER_LABEL[i.folder], i.provider || '', i.date ? fd(i.date) : '',
      i.value != null ? String(i.value) : '', ORIGIN_LABEL[i.source] || 'Αρχείο',
    ]));

  // Ενιαίο σημείο ανεβάσματος — ζει στο PageTitle (ή στη γραμμή εργαλείων όταν embedded).
  const uploadBtn = (
    <Btn variant="primary" onClick={() => setShowUpload(s => !s)}>
      <svg {...S} width={15} height={15}><path d="M12 5v14M5 12h14"/></svg>Νέο αρχείο
    </Btn>
  );
  const headerActions = (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {items.length > 0 && <ExportButton onClick={exportCsv} />}
      {uploadBtn}
    </div>
  );

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>
      {!embedded && (
        <PageTitle title="Αρχείο"
          sub="Ένας οργανωμένος ψηφιακός φάκελος — συμβόλαια, έγγραφα, φόροι, λογαριασμοί, πάροχοι, εγγυήσεις, τιμολόγια και φωτογραφίες, αυτόματα ταξινομημένα ώστε να τα βρίσκεις με 2 κλικ"
          right={headerActions}/>
      )}

      <KPIGrid items={[
        { label: 'Σύνολο αρχείων', value: fn(items.length) },
        { label: 'Έγγραφα',        value: fn(docCount) },
        { label: 'Φωτογραφίες',    value: fn(photoCount) },
        isPro
          ? { label: 'Καταγεγραμμένη αξία', value: totalValue > 0 ? fe(totalValue) : '—' }
          : { label: 'Κατηγορίες', value: fn(activeCategories) },
      ]}/>

      {colWarn && <InfoBanner tone="warning">Ορισμένα Έξοδα δεν διαθέτουν στήλη συνημμένου αρχείου· εμφανίζονται μόνο όσα έχουν επισυναπτόμενη απόδειξη/τιμολόγιο.</InfoBanner>}

      {/* ── Κάρτα ανεβάσματος ──────────────────────────────────────────── */}
      {showUpload && (
        <div className="card">
          <SecHdr label="Αρχειοθέτηση νέου εγγράφου" sub="Σύρε ή επίλεξε πολλά αρχεία μαζί — αναγνωρίζονται και τοποθετούνται αυτόματα στον σωστό φάκελο"
            right={<button onClick={() => setShowUpload(false)} title="Κλείσιμο" style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 15, lineHeight: 1 }}>✕</button>}/>

          <div style={{ display: 'flex', gap: 4, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.btn, padding: 4, marginBottom: 14, width: 'fit-content' }}>
            {([['document', 'Έγγραφο'], ['photo', 'Φωτογραφία']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setForm(f => ({ ...f, kind: k }))}
                style={{ padding: '7px 16px', borderRadius: T.radius.btn, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: form.kind === k ? 700 : 500, fontFamily: T.font.sans, background: form.kind === k ? 'var(--accent)' : 'transparent', color: form.kind === k ? 'var(--accent-text)' : 'var(--text-secondary)' }}>{l}</button>
            ))}
          </div>

          {/* Αυτόματη αναγνώριση (AI) — μόνο για έγγραφα· φωτογραφίες ταξινομούνται χειροκίνητα */}
          {form.kind === 'document' && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 14, cursor: 'pointer', userSelect: 'none' }}>
              <span style={{ position: 'relative', width: 34, height: 20, borderRadius: T.radius.pill, background: autoDetect ? 'var(--accent)' : 'var(--border-default)', transition: `background 0.18s ${T.ease.standard}`, flexShrink: 0 }}>
                <span style={{ position: 'absolute', top: 2, left: autoDetect ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: `left 0.18s ${T.ease.standard}` }}/>
              </span>
              <input type="checkbox" checked={autoDetect} onChange={e => setAutoDetect(e.target.checked)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}/>
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Αυτόματη αναγνώριση (AI)</span>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>εντοπίζει τύπο, πάροχο & ημερομηνία και αρχειοθετεί μόνο του στον σωστό φάκελο</span>
              </span>
            </label>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 14, marginBottom: 14 }}>
            <CustomSelect label={autoOn ? 'Κατηγορία (εφεδρική)' : 'Κατηγορία (φάκελος)'} value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))}
              options={(form.kind === 'photo' ? PHOTO_CATEGORIES : DOC_CATEGORIES).map(c => ({ value: c, label: c }))}/>
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 6, fontFamily: T.font.sans }}>Προμηθευτής / Πάροχος</label>
              <input list="supplier-suggestions" value={form.supplier}
                onChange={e => { const v = e.target.value; setForm(f => { const next = { ...f, supplier: v }; if (prefs.autoSuggestCategory && f.kind === 'document') { const c = suggestCategory(v); if (c && DOC_CATEGORIES.includes(c)) next.category = c; } return next; }); }}
                placeholder="π.χ. ΔΕΗ, ΕΥΔΑΠ, COSMOTE…"
                style={{ width: '100%', height: 40, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: T.radius.inner, padding: '0 14px', color: 'var(--text-primary)', fontSize: 13, fontFamily: T.font.sans, outline: 'none', boxSizing: 'border-box' }}/>
              <datalist id="supplier-suggestions">{COMMON_SUPPLIERS.map(s => <option key={s} value={s}/>)}</datalist>
            </div>
            <DatePicker label="Ημερομηνία" value={form.doc_date} onChange={v => setForm(f => ({ ...f, doc_date: v }))}/>
          </div>
          <div style={{ marginBottom: 14 }}>
            <TextInput label="Τίτλος / Περιγραφή" value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))}
              placeholder={form.kind === 'photo' ? 'π.χ. Σαλόνι, βόρειος τοίχος' : 'π.χ. ΔΕΗ Ιανουάριος 2026'}/>
          </div>
          <div style={{ marginBottom: 14 }}>
            <Textarea label="Σημειώσεις" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} placeholder="Προαιρετικές σημειώσεις"/>
          </div>
          {/* Ενιαία επιφάνεια ανεβάσματος: drag-and-drop ή κλικ, πολλαπλά αρχεία μαζί */}
          <div
            onClick={() => { if (!uploading) fileRef.current?.click(); }}
            onDragOver={e => { e.preventDefault(); if (!uploading && !dragOver) setDragOver(true); }}
            onDragLeave={e => { e.preventDefault(); setDragOver(false); }}
            onDrop={e => { e.preventDefault(); setDragOver(false); if (!uploading && e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files); }}
            style={{ border: `1.5px dashed ${dragOver ? 'var(--accent)' : 'var(--border-default)'}`, background: dragOver ? 'var(--accent-soft)' : 'var(--bg-elevated)', borderRadius: T.radius.card, padding: '26px 20px', textAlign: 'center', cursor: uploading ? 'default' : 'pointer', transition: `all 0.18s ${T.ease.standard}`, opacity: uploading ? 0.75 : 1 }}>
            <div style={{ color: dragOver ? 'var(--accent)' : 'var(--text-tertiary)', marginBottom: 8, display: 'flex', justifyContent: 'center' }}>
              <svg {...S} width={26} height={26}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              {uploading ? 'Ανέβασμα σε εξέλιξη…' : dragOver ? 'Άφησε τα αρχεία εδώ' : 'Σύρε αρχεία εδώ ή κάνε κλικ για επιλογή'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>
              {form.kind === 'photo'
                ? 'Πολλαπλές φωτογραφίες μαζί · PNG, JPEG, WebP…'
                : autoOn ? 'Αυτόματη αναγνώριση & αρχειοθέτηση · PDF, εικόνα, Word, Excel…' : 'Πολλαπλά αρχεία μαζί · PDF, εικόνα, Word, Excel…'}
            </div>
          </div>
          <input ref={fileRef} type="file" multiple accept={form.kind === 'photo' ? 'image/*' : 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt'} style={{ display: 'none' }}
            onChange={e => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ''; }}/>

          {/* Per-file πρόοδος */}
          {queue.length > 0 && (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {queue.map(t => {
                const pct = t.status === 'done' || t.status === 'error' ? 100 : t.status === 'uploading' ? 70 : t.status === 'ocr' ? 35 : 12;
                const barColor = t.status === 'error' ? 'var(--negative)' : t.status === 'done' ? 'var(--positive)' : 'var(--accent)';
                const statusText = t.status === 'ocr' ? 'Αναγνώριση…' : t.status === 'uploading' ? 'Ανέβασμα…' : t.status === 'done' ? (t.label || 'Αρχειοθετήθηκε') : t.status === 'error' ? 'Σφάλμα' : 'Σε αναμονή';
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '8px 12px' }}>
                    <svg {...S} width={15} height={15} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                      <div style={{ height: 3, background: 'var(--bg-overlay)', borderRadius: 2, overflow: 'hidden', marginTop: 5 }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 2, transition: `width 0.25s ${T.ease.standard}` }}/>
                      </div>
                    </div>
                    <span style={{ fontSize: 9.5, fontWeight: 600, color: t.status === 'error' ? 'var(--negative)' : t.status === 'done' ? 'var(--positive)' : 'var(--text-secondary)', whiteSpace: 'nowrap', maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0 }}>{statusText}</span>
                  </div>
                );
              })}
            </div>
          )}

          {msg && <div style={{ marginTop: 12, fontSize: 11, fontWeight: 600, color: msg.error ? 'var(--negative)' : 'var(--positive)' }}>{msg.text}</div>}
        </div>
      )}

      {/* ── Γραμμή εργαλείων: breadcrumb + αναζήτηση + προβολή ──────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 220 }}>
          {crumb('Αρχείο', () => { setFolderKey(null); setSubKey(null); setQuery(''); }, !folderKey && !q)}
          {q && (<>{sep}{crumb('Αναζήτηση', undefined, true)}</>)}
          {!q && folderKey && (<>{sep}{crumb(FOLDER_LABEL[folderKey], () => setSubKey(null), !subKey)}</>)}
          {!q && folderKey && subKey != null && (<>{sep}{crumb(subKey, undefined, true)}</>)}
        </div>

        <div style={{ position: 'relative', width: 240, maxWidth: '100%' }}>
          <svg {...S} width={15} height={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }}><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Αναζήτηση σε όλο το αρχείο…"
            style={{ width: '100%', height: 38, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: T.radius.pill, padding: '0 34px 0 34px', color: 'var(--text-primary)', fontSize: 12, fontFamily: T.font.sans, outline: 'none', boxSizing: 'border-box' }}/>
          {query && <button onClick={() => setQuery('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 13 }}>✕</button>}
        </div>

        <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border-subtle)', borderRadius: T.radius.badge, overflow: 'hidden' }}>
          {([['grid', 'Πλέγμα', <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>],
             ['list', 'Λίστα', <><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></>]] as const).map(([k, title, ic]) => (
            <button key={k} onClick={() => setView(k)} title={title}
              style={{ width: 38, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', background: view === k ? 'var(--accent)' : 'transparent', color: view === k ? 'var(--accent-text)' : 'var(--text-secondary)' }}>
              <svg {...S} width={15} height={15}>{ic}</svg>
            </button>
          ))}
        </div>

        {embedded && headerActions}
      </div>

      {/* ── Περιεχόμενο ─────────────────────────────────────────────────── */}
      {loading ? <Spinner label="Φόρτωση αρχείου…"/> :
        q ? (
          <FileList items={searchResults ?? []} view={view} showFolder onOpenLightbox={setLightbox} onDelete={del}
            empty={<EmptyState title="Κανένα αποτέλεσμα" hint={`Δεν βρέθηκε αρχείο για «${query}».`}/>}/>
        ) : !folderKey ? (
          /* Επίπεδο 0: φάκελοι κατηγοριών */
          items.length === 0 ? (
            <div className="card"><EmptyState title="Το αρχείο είναι κενό"
              hint="Ανέβασε το πρώτο συμβόλαιο, λογαριασμό ή τιμολόγιο. Ό,τι καταχωρείς στα Έξοδα, τους Λογαριασμούς ή την Απογραφή αρχειοθετείται κι εδώ αυτόματα."
              action={<Btn variant="primary" onClick={() => setShowUpload(true)}>Νέο αρχείο</Btn>}/></div>
          ) : view === 'grid' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
              {FOLDERS.map(f => <FolderCardGrid key={f.key} k={f.key} label={f.label} count={counts.count[f.key] || 0} value={isPro ? counts.value[f.key] : undefined} onClick={() => openFolder(f.key)}/>)}
            </div>
          ) : (
            <div className="card" style={{ padding: 8 }}>
              {FOLDERS.map(f => <FolderRow key={f.key} k={f.key} label={f.label} count={counts.count[f.key] || 0} value={isPro ? counts.value[f.key] : undefined} onClick={() => openFolder(f.key)}/>)}
            </div>
          )
        ) : subKey == null ? (
          /* Επίπεδο 1: υποφάκελοι (πάροχος ή έτος) */
          <>
            {providersInFolder.length > 0 && (
              <div style={{ display: 'flex', gap: 4, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.btn, padding: 3, width: 'fit-content', marginBottom: 14 }}>
                {([['provider', 'Ανά πάροχο'], ['date', 'Ανά ημερομηνία']] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setSubMode(k)}
                    style={{ padding: '6px 14px', borderRadius: T.radius.badge, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: subMode === k ? 700 : 500, fontFamily: T.font.sans, background: subMode === k ? 'var(--accent)' : 'transparent', color: subMode === k ? 'var(--accent-text)' : 'var(--text-secondary)' }}>{l}</button>
                ))}
              </div>
            )}
            {folderItems.length === 0 ? (
              <div className="card"><EmptyState title={`Ο φάκελος «${FOLDER_LABEL[folderKey]}» είναι κενός`} hint="Μόλις καταχωρηθεί σχετικό έγγραφο, θα εμφανιστεί εδώ αυτόματα."/></div>
            ) : view === 'grid' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
                {subfolders.map(([name, its]) => <SubfolderCardGrid key={name} name={name} mode={subMode} count={its.length} value={isPro ? its.reduce((s, i) => s + (i.value || 0), 0) : undefined} onClick={() => setSubKey(name)}/>)}
              </div>
            ) : (
              <div className="card" style={{ padding: 8 }}>
                {subfolders.map(([name, its]) => <SubfolderRow key={name} name={name} mode={subMode} count={its.length} onClick={() => setSubKey(name)}/>)}
              </div>
            )}
          </>
        ) : (
          /* Επίπεδο 2: αρχεία */
          <FileList items={subItems.sort(byDateDesc)} view={view} groupByMonth={subMode === 'date'} onOpenLightbox={setLightbox} onDelete={del}
            empty={<EmptyState title="Κανένα αρχείο εδώ"/>}/>
        )}

      {/* ── Lightbox ────────────────────────────────────────────────────── */}
      {lightbox && lightbox.url && (
        <div onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, flexDirection: 'column', gap: 12 }}>
          <img src={lightbox.url} alt={lightbox.title} style={{ maxWidth: '92%', maxHeight: '82%', objectFit: 'contain', borderRadius: T.radius.inner }}/>
          <div style={{ color: '#fff', fontSize: 12, fontFamily: T.font.sans, textAlign: 'center' }}>
            <div style={{ fontWeight: 700 }}>{lightbox.title}</div>
            <div style={{ opacity: 0.7, marginTop: 2 }}>{[lightbox.category, lightbox.provider, lightbox.date ? fd(lightbox.date) : null].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Ταξινόμηση κατά ημερομηνία (φθίνουσα) ──────────────────────────────── */
function byDateDesc(a: Item, b: Item) {
  const ad = a.date ? new Date(a.date).getTime() : 0;
  const bd = b.date ? new Date(b.date).getTime() : 0;
  return bd - ad;
}

/* ── Κάρτα φακέλου (πλέγμα) ──────────────────────────────────────────────── */
function FolderCardGrid({ k, label, count, value, onClick }: { k: FolderKey; label: string; count: number; value?: number; onClick: () => void }) {
  const empty = count === 0;
  return (
    <button onClick={onClick} className="card" style={{ textAlign: 'left', cursor: 'pointer', padding: 16, margin: 0, display: 'flex', flexDirection: 'column', gap: 12, opacity: empty ? 0.55 : 1, border: '1px solid var(--border-subtle)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ width: 42, height: 42, borderRadius: T.radius.inner, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <FolderGlyph k={k}/>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', color: empty ? 'var(--text-tertiary)' : 'var(--text-secondary)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.badge, padding: '2px 9px' }}>{count}</span>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
          {value != null && value > 0 ? fe(value) : count === 0 ? 'Κενός φάκελος' : `${count} ${count === 1 ? 'αρχείο' : 'αρχεία'}`}
        </div>
      </div>
    </button>
  );
}

function FolderRow({ k, label, count, value, onClick }: { k: FolderKey; label: string; count: number; value?: number; onClick: () => void }) {
  const empty = count === 0;
  return (
    <button onClick={onClick} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'transparent', border: 'none', borderRadius: T.radius.inner, cursor: 'pointer', opacity: empty ? 0.55 : 1 }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      <span style={{ color: 'var(--accent)', display: 'flex' }}><FolderGlyph k={k} size={19}/></span>
      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</span>
      {value != null && value > 0 && <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.mono }}>{fe(value)}</span>}
      <span style={{ fontSize: 11, fontWeight: 700, fontFamily: T.font.mono, color: 'var(--text-secondary)', minWidth: 26, textAlign: 'right' }}>{count}</span>
      <svg {...S} width={15} height={15} style={{ color: 'var(--text-tertiary)' }}><path d="m9 18 6-6-6-6"/></svg>
    </button>
  );
}

/* ── Υποφάκελος (πάροχος ή έτος) ─────────────────────────────────────────── */
function SubfolderCardGrid({ name, mode, count, value, onClick }: { name: string; mode: 'provider' | 'date'; count: number; value?: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className="card" style={{ textAlign: 'left', cursor: 'pointer', padding: 16, margin: 0, display: 'flex', flexDirection: 'column', gap: 12, border: '1px solid var(--border-subtle)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ width: 42, height: 42, borderRadius: T.radius.inner, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg {...S} width={20} height={20}>{mode === 'provider'
            ? <><path d="M4 20V8a2 2 0 0 1 2-2h3l2-2h4a2 2 0 0 1 2 2v2"/><path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V12a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/></>
            : <><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></>}</svg>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, fontFamily: T.font.mono, color: 'var(--text-secondary)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.badge, padding: '2px 9px' }}>{count}</span>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>{value != null && value > 0 ? fe(value) : `${count} ${count === 1 ? 'αρχείο' : 'αρχεία'}`}</div>
      </div>
    </button>
  );
}

function SubfolderRow({ name, mode, count, onClick }: { name: string; mode: 'provider' | 'date'; count: number; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'transparent', border: 'none', borderRadius: T.radius.inner, cursor: 'pointer' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      <span style={{ color: 'var(--text-secondary)', display: 'flex' }}>
        <svg {...S} width={18} height={18}>{mode === 'provider'
          ? <><path d="M4 20V8a2 2 0 0 1 2-2h3l2-2h4a2 2 0 0 1 2 2v2"/><path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V12a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/></>
          : <><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></>}</svg>
      </span>
      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{name}</span>
      <span style={{ fontSize: 11, fontWeight: 700, fontFamily: T.font.mono, color: 'var(--text-secondary)' }}>{count}</span>
      <svg {...S} width={15} height={15} style={{ color: 'var(--text-tertiary)' }}><path d="m9 18 6-6-6-6"/></svg>
    </button>
  );
}

/* ── Λίστα αρχείων ───────────────────────────────────────────────────────── */
function FileList({ items, view, groupByMonth, showFolder, onOpenLightbox, onDelete, empty }: {
  items: Item[]; view: 'grid' | 'list'; groupByMonth?: boolean; showFolder?: boolean;
  onOpenLightbox: (i: Item) => void; onDelete: (i: Item) => void; empty: React.ReactNode;
}) {
  if (items.length === 0) return <div className="card">{empty}</div>;

  if (groupByMonth) {
    const groups = new Map<string, Item[]>();
    items.forEach(i => { const key = i.date ? monthLabel(i.date) : 'Χωρίς ημερομηνία'; (groups.get(key) ?? groups.set(key, []).get(key)!).push(i); });
    return (
      <>
        {Array.from(groups.entries()).map(([m, its]) => (
          <div key={m} className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }}/>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.06em', textTransform: 'capitalize' as const }}>{m}</span>
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{its.length} {its.length === 1 ? 'αρχείο' : 'αρχεία'}</span>
            </div>
            <FileInner items={its} view={view} showFolder={showFolder} onOpenLightbox={onOpenLightbox} onDelete={onDelete}/>
          </div>
        ))}
      </>
    );
  }
  return <div className="card"><FileInner items={items} view={view} showFolder={showFolder} onOpenLightbox={onOpenLightbox} onDelete={onDelete}/></div>;
}

function FileInner({ items, view, showFolder, onOpenLightbox, onDelete }: {
  items: Item[]; view: 'grid' | 'list'; showFolder?: boolean; onOpenLightbox: (i: Item) => void; onDelete: (i: Item) => void;
}) {
  if (view === 'grid') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        {items.map(i => (
          <div key={i.id} style={{ borderRadius: T.radius.inner, overflow: 'hidden', border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}>
            <div style={{ position: 'relative', aspectRatio: '4 / 3', background: 'var(--bg-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: i.isImage && i.url ? 'pointer' : 'default' }}
              onClick={() => { if (i.isImage && i.url) onOpenLightbox(i); }}>
              {i.isImage && i.url
                ? <img src={i.url} alt={i.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                : <span style={{ color: 'var(--accent)' }}><svg {...S} width={30} height={30}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span>}
              {i.raw && <button onClick={e => { e.stopPropagation(); onDelete(i); }} title="Διαγραφή"
                style={{ position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'pointer', fontSize: 13 }}>✕</button>}
            </div>
            <div style={{ padding: '9px 11px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.title}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                <OriginTag i={i}/>
                {i.value != null && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-secondary)', fontFamily: T.font.mono }}>{fe(i.value)}</span>}
                <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: T.font.mono, marginLeft: 'auto' }}>{i.date ? fd(i.date) : '—'}</span>
              </div>
              {i.url && <a href={i.url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 8, fontSize: 10, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}>Άνοιγμα →</a>}
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map(i => (
        <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '10px 14px' }}>
          {i.isImage && i.url
            ? <img src={i.url} alt="" onClick={() => onOpenLightbox(i)} style={{ width: 40, height: 40, borderRadius: T.radius.badge, objectFit: 'cover', flexShrink: 0, cursor: 'pointer', border: '1px solid var(--border-subtle)' }}/>
            : <div style={{ width: 40, height: 40, borderRadius: T.radius.badge, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--accent)' }}>
                <svg {...S} width={17} height={17}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              </div>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 300 }}>{i.title}</span>
              <OriginTag i={i}/>
              {showFolder && <span style={{ fontSize: 9, color: 'var(--accent)', fontWeight: 600 }}>{FOLDER_LABEL[i.folder]}</span>}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
              {[i.date ? fd(i.date) : null, i.sizeBytes ? fmtSize(i.sizeBytes) : null, i.note].filter(Boolean).join(' · ')}
            </div>
          </div>
          {i.value != null && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.mono, whiteSpace: 'nowrap' }}>{fe(i.value)}</span>}
          {i.url && <a href={i.url} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none', padding: '6px 12px', border: '1px solid var(--accent-border)', borderRadius: T.radius.badge, whiteSpace: 'nowrap' }}>Άνοιγμα</a>}
          {i.raw && <button onClick={() => onDelete(i)} title="Διαγραφή"
            style={{ width: 28, height: 28, borderRadius: T.radius.badge, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 13, flexShrink: 0 }}>✕</button>}
        </div>
      ))}
    </div>
  );
}

// Σήματα προέλευσης: πάροχος (αν υπάρχει) + πηγή αρχειοθέτησης (Έξοδα/Λογαριασμοί/
// Απογραφή). Εμφανίζονται μία φορά ώστε να μην επαναλαμβάνονται στη γραμμή meta.
function OriginTag({ i }: { i: Item }) {
  const label = ORIGIN_LABEL[i.source];
  if (!i.provider && !label) return null;
  return (
    <>
      {i.provider && <Badge tone="neutral">{i.provider}</Badge>}
      {label && <Badge tone="neutral">από {label}</Badge>}
    </>
  );
}
