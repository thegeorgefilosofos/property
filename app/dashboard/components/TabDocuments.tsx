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
// Σύστημα auto-αναγνώρισης φωτογραφίας ακινήτου (vision). Επιστρέφει ΜΟΝΟ JSON.
const PHOTO_SYSTEM_PROMPT = `Είσαι σύστημα ταξινόμησης φωτογραφιών ακινήτου. Εξέτασε τη φωτογραφία και επίστρεψε ΑΥΣΤΗΡΑ ΜΟΝΟ JSON, χωρίς άλλο κείμενο:
{"category":"<μία από: Κατάσταση Ακινήτου | Ζημιά / Φθορά | Ανακαίνιση | Εξωτερικοί Χώροι | Άλλο>","title":"<σύντομη ελληνική περιγραφή χώρου/θέματος, π.χ. Σαλόνι, Κουζίνα, Μπάνιο, Υπνοδωμάτιο, Μπαλκόνι>"}
Κανόνες κατηγορίας:
- Εμφανής φθορά/ζημιά/υγρασία/ρωγμή/σπασμένο → "Ζημιά / Φθορά".
- Εργασίες/ανακαίνιση σε εξέλιξη (μπάζα, εργαλεία, γυμνοί τοίχοι) → "Ανακαίνιση".
- Εξωτερικός χώρος/μπαλκόνι/κήπος/αυλή/πρόσοψη/πυλωτή → "Εξωτερικοί Χώροι".
- Κανονικός εσωτερικός χώρος σε καλή κατάσταση → "Κατάσταση Ακινήτου".
- Αν δεν σχετίζεται με ακίνητο → "Άλλο".`;

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
  'ΔΕΗ', 'Protergia', 'ΗΡΩΝ', 'NRG', 'Elpedison', 'Elin', 'Volton', 'Volterra', 'Zenith',
  'Φυσικό Αέριο Ελλάδος', 'ΔΕΠΑ', 'ΕΥΔΑΠ', 'ΕΥΑΘ', 'ΔΕΥΑ',
  'COSMOTE', 'Vodafone', 'Nova', 'Inalan',
  'Εθνική Ασφαλιστική', 'Interamerican', 'Eurolife', 'Allianz', 'Generali', 'ERGO', 'NN Hellas', 'Hellas Direct',
  'Διαχείριση Πολυκατοικίας', 'Συνεργείο Καθαρισμού',
];

// Προτεινόμενοι ΕΝΕΡΓΟΙ πάροχοι ΑΝΑ κατηγορία-φάκελο — ώστε μόλις επιλεγεί η
// κατηγορία, το πεδίο «Προμηθευτής/Πάροχος» να προτείνει τους σωστούς παρόχους.
const CATEGORY_SUPPLIERS: Record<string, string[]> = {
  'Λογαριασμός Ρεύματος': ['ΔΕΗ', 'Protergia', 'ΗΡΩΝ', 'NRG', 'Elpedison', 'Elin', 'Volton', 'Volterra', 'Zenith', 'We Energy', 'Φυσικό Αέριο Ελλάδος'],
  'Λογαριασμός Φυσικού Αερίου': ['Φυσικό Αέριο Ελλάδος', 'ΔΕΠΑ', 'ΗΡΩΝ', 'Zenith', 'Protergia', 'Elpedison', 'Αέριο Αττικής'],
  'Λογαριασμός Νερού': ['ΕΥΔΑΠ', 'ΕΥΑΘ', 'ΔΕΥΑ'],
  'Τηλέφωνο / Internet': ['COSMOTE', 'Vodafone', 'Nova', 'Inalan', 'ΟΤΕ'],
  'Ασφαλιστήριο Συμβόλαιο': ['Εθνική Ασφαλιστική', 'Interamerican', 'Eurolife', 'Allianz', 'Generali', 'ERGO', 'Groupama', 'NN Hellas', 'Υδρόγειος', 'Interlife', 'Hellas Direct'],
  'ΕΝΦΙΑ / Φορολογικά': ['ΑΑΔΕ', 'Δήμος'],
  'Κοινόχρηστα': ['Διαχείριση Πολυκατοικίας'],
  'Τιμολόγιο Καθαρισμού': ['Συνεργείο Καθαρισμού'],
  'Συντήρηση Ανελκυστήρα': ['Kleemann', 'Otis', 'Schindler', 'TK Elevator'],
  'Εταιρεία Ασφαλείας': ['G4S', 'Securitas', 'ADT'],
};

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

/* ── AI helpers (κοινά για OCR εγγράφου & vision φωτογραφίας) ─────────────── */
// Ανάγνωση αρχείου σε base64 (χωρίς το data: prefix). null σε αποτυχία.
const fileToBase64 = (file: File): Promise<string | null> => new Promise(resolve => {
  const r = new FileReader();
  r.onload = () => resolve((r.result as string).split(',')[1] || null);
  r.onerror = () => resolve(null);
  r.readAsDataURL(file);
});
// Κλήση /api/anthropic με ΧΡΟΝΙΚΟ ΟΡΙΟ (AbortController) ώστε μια αργή/κολλημένη
// απόκριση να ΜΗΝ παγώνει την ουρά ανεβάσματος. Επιστρέφει το JSON ή null.
const anthropicJson = async (body: unknown, timeoutMs = 30000): Promise<{ content?: { type: string; text?: string }[] } | null> => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch('/api/anthropic', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
    const data = await res.json();
    if (!res.ok || (data as { error?: unknown })?.error) return null;
    return data;
  } catch { return null; } finally { clearTimeout(timer); }
};
// Εξαγωγή πρώτου text από απόκριση Anthropic + parse JSON (καθαρίζει code fences).
function parseAnthropicJson<T>(data: { content?: { type: string; text?: string }[] } | null): T | null {
  const text = (data?.content || []).find(c => c.type === 'text')?.text || '';
  if (!text) return null;
  try { return JSON.parse(text.replace(/```json?|```/g, '').trim()) as T; } catch { return null; }
}

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
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">{p[k]}</svg>;
};
// Εικονίδιο υποφακέλου (πάροχος ή έτος) — ΕΝΑ σημείο αλήθειας αντί για διπλό inline SVG.
const SubfolderGlyph = ({ mode, size = 20 }: { mode: 'provider' | 'date'; size?: number }) => (
  <svg {...S} width={size} height={size}>{mode === 'provider'
    ? <><path d="M4 20V8a2 2 0 0 1 2-2h3l2-2h4a2 2 0 0 1 2 2v2"/><path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V12a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/></>
    : <><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></>}</svg>
);
// Σταθερό «×» (κλείσιμο/διαγραφή) — αντικαθιστά τα επαναλαμβανόμενα inline SVG.
const IconX = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
);
const IconCheck = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
);
const IconPencil = ({ size = 14 }: { size?: number }) => (
  <svg {...S} width={size} height={size}><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
);
const IconMoveFolder = ({ size = 14 }: { size?: number }) => (
  <svg {...S} width={size} height={size}><path d="M4 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v3"/><path d="M14 17h7M18 14l3 3-3 3"/></svg>
);
const IconTrash = ({ size = 14 }: { size?: number }) => (
  <svg {...S} width={size} height={size}><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
);
const IconDownload = ({ size = 14 }: { size?: number }) => (
  <svg {...S} width={size} height={size}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/></svg>
);

// Premium custom checkbox (ίδια γλώσσα με τις Επαφές): στρογγυλό τετράγωνο,
// accent γέμισμα, tick, προσβάσιμο με πληκτρολόγιο.
function SelectBox({ checked, onToggle, size = 18 }: { checked: boolean; onToggle: () => void; size?: number }) {
  return (
    <span role="checkbox" aria-checked={checked} tabIndex={0}
      onClick={e => { e.stopPropagation(); onToggle(); }}
      onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onToggle(); } }}
      style={{ width: size, height: size, borderRadius: 6, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: checked ? 'var(--accent)' : 'var(--bg-elevated)', border: `1.5px solid ${checked ? 'var(--accent)' : 'var(--border-default)'}`, color: 'var(--accent-text)', cursor: 'pointer', boxShadow: checked ? '0 1px 4px color-mix(in srgb, var(--accent) 40%, transparent)' : 'none', transition: `background 0.14s ${T.ease.standard}, border-color 0.14s ${T.ease.standard}` }}>
      {checked ? <IconCheck/> : null}
    </span>
  );
}

// Ουδέτερο κουμπί μαζικής ενέργειας που αποκαλύπτει accent —ή κόκκινο για διαγραφή— στο hover.
function BulkBtn({ icon, label, onClick, disabled, danger }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  const [hov, setHov] = useState(false);
  const active = hov && !disabled;
  return (
    <button type="button" disabled={disabled} onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: T.radius.btn, fontSize: 12, fontWeight: 600, fontFamily: T.font.sans, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
        border: `1px solid ${active ? (danger ? 'var(--negative-border)' : 'var(--accent-border)') : 'var(--border-subtle)'}`,
        background: active ? (danger ? 'var(--negative-soft)' : 'var(--accent-soft)') : 'var(--bg-elevated)',
        color: active ? (danger ? 'var(--negative)' : 'var(--accent)') : 'var(--text-secondary)',
        transition: `background 0.14s ${T.ease.standard}, border-color 0.14s ${T.ease.standard}, color 0.14s ${T.ease.standard}` }}>
      {icon}{label}
    </button>
  );
}

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

  // Διαχείριση αρχείων (μόνο για ανεβασμένα property_documents)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveItems, setMoveItems] = useState<Item[] | null>(null);   // ανοιχτό modal μετακίνησης
  const [renameItem, setRenameItem] = useState<Item | null>(null);   // ανοιχτό modal μετονομασίας

  // Ανέβασμα
  const [showUpload, setShowUpload] = useState(false);
  const [uploadMin, setUploadMin] = useState(false);   // ελαχιστοποιημένη (collapsed) κάρτα ανεβάσματος
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [form, setForm] = useState({ kind: 'document' as 'photo' | 'document', category: DOC_CATEGORIES[0], supplier: '', title: '', doc_date: '', notes: '' });
  const [autoDetect, setAutoDetect] = useState(true);   // αυτόματη αναγνώριση/αρχειοθέτηση (AI)
  const [dragOver, setDragOver] = useState(false);
  const [queue, setQueue] = useState<UploadTask[]>([]);  // per-file πρόοδος bulk upload
  const fileRef = useRef<HTMLInputElement>(null);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);   // χρονόμετρο καθαρισμού ουράς (ακυρώνεται σε νέα παρτίδα)

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
  // Καθάρισε την επιλογή όταν αλλάζει το πλαίσιο πλοήγησης (φάκελος/υποφάκελος/αναζήτηση).
  useEffect(() => { setSelected(new Set()); }, [folderKey, subKey, query]);
  // Esc: κλείσιμο lightbox.
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  /* ── Ανέβασμα (γράφει στο property_documents) ─────────────────────────── */
  const autoOn = autoDetect;   // αυτόματη αναγνώριση για έγγραφα (OCR) & φωτογραφίες (vision)

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
    const base64 = await fileToBase64(file);
    if (!base64) return null;
    const contentPart: Record<string, unknown> = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: file.type || 'image/jpeg', data: base64 } };
    const data = await anthropicJson({
      model: 'claude-sonnet-5', max_tokens: 1500, system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: [contentPart, { type: 'text', text: 'Αναγνώρισε και ανάλυσε αυτό το έγγραφο. Διάβασε κάθε στοιχείο με ακρίβεια.' }] }],
    });
    const doc = parseAnthropicJson<ScannedDoc>(data);
    if (!doc || typeof doc !== 'object') return null;
    try {
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

  // Auto-αναγνώριση ΦΩΤΟΓΡΑΦΙΑΣ ακινήτου (vision): εντοπίζει κατηγορία
  // (Ζημιά/Ανακαίνιση/Εξωτερικοί Χώροι/Κατάσταση) + σύντομο τίτλο (χώρο/θέμα).
  // Επιστρέφει null σε μη-εικόνα ή αποτυχία — ποτέ δεν μπλοκάρει το ανέβασμα.
  const photoClassify = async (file: File): Promise<{ category: string; title: string | null } | null> => {
    if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) return null;
    const base64 = await fileToBase64(file);
    if (!base64) return null;
    const data = await anthropicJson({
      model: 'claude-sonnet-5', max_tokens: 200, system: PHOTO_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: file.type || 'image/jpeg', data: base64 } }, { type: 'text', text: 'Κατηγοριοποίησε αυτή τη φωτογραφία ακινήτου.' }] }],
    });
    const parsed = parseAnthropicJson<{ category?: string; title?: string }>(data);
    if (!parsed) return null;
    const category = parsed.category && PHOTO_CATEGORIES.includes(parsed.category) ? parsed.category : 'Κατάσταση Ακινήτου';
    return { category, title: parsed.title?.trim() || null };
  };

  // Bulk: ουρά με per-file πρόοδο. Ακολουθιακή επεξεργασία (concurrency 1) ώστε να
  // μη φουσκώνει το κόστος/latency των AI κλήσεων ούτε να πιέζεται η βάση.
  const handleFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (!files.length || !propertyId || uploading) return;
    // Ακύρωσε τυχόν εκκρεμές χρονόμετρο καθαρισμού προηγούμενης παρτίδας, ώστε να μη
    // σβήσει την πρόοδο της νέας παρτίδας που μόλις ξεκινά.
    if (clearTimerRef.current) { clearTimeout(clearTimerRef.current); clearTimerRef.current = null; }
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
      if (autoOn && form.kind === 'document') {
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
      } else if (autoOn && form.kind === 'photo') {
        upd(id, { status: 'ocr' });
        const p = await photoClassify(file);
        if (p) meta = { ...meta, kind: 'photo', category: p.category, title: meta.title || p.title || '' };
        // Αποτυχία/μη-εικόνα: κρατάμε την εφεδρική χειροκίνητη κατηγορία φωτογραφίας.
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
    clearTimerRef.current = setTimeout(() => { setQueue([]); setMsg(null); clearTimerRef.current = null; }, 5000);
  };

  const del = async (it: Item) => {
    if (!it.raw) return;
    if (prefs.confirmBeforeDelete && !window.confirm('Να διαγραφεί οριστικά αυτό το αρχείο;')) return;
    await supabase.storage.from('property-files').remove([it.raw.file_path]);
    await supabase.from('property_documents').delete().eq('id', it.raw.id);
    if (lightbox?.id === it.id) setLightbox(null);
    fetchAll();
  };

  // ── Διαχείριση (μετονομασία / μετακίνηση / μαζικές ενέργειες) ────────────
  // Ενημερώνει μόνο ανεβασμένα αρχεία (property_documents)· τα κατοπτρικά
  // στοιχεία (Έξοδα/Λογαριασμοί/Απογραφή) διαχειρίζονται στην πηγή τους.
  const updateDocs = async (its: Item[], patch: { category?: string; title?: string }) => {
    const rawIds = its.filter(i => i.raw).map(i => i.raw!.id);
    if (!rawIds.length) return;
    await supabase.from('property_documents').update(patch).in('id', rawIds);
    fetchAll();
  };
  const applyRename = async (title: string) => { if (renameItem && title.trim()) await updateDocs([renameItem], { title: title.trim().slice(0, 200) }); setRenameItem(null); };
  const applyMove = async (category: string) => { if (moveItems?.length) await updateDocs(moveItems, { category }); setMoveItems(null); setSelected(new Set()); };

  const toggleSel = (id: string) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selItems = useMemo(() => items.filter(i => selected.has(i.id)), [items, selected]);
  const selDocs = useMemo(() => selItems.filter(i => i.raw && i.raw.kind === 'document'), [selItems]);
  const selRaw = useMemo(() => selItems.filter(i => i.raw), [selItems]);
  const bulkDelete = async () => {
    if (!selRaw.length) return;
    if (prefs.confirmBeforeDelete && !window.confirm(`Να διαγραφούν οριστικά ${selRaw.length} ${selRaw.length === 1 ? 'αρχείο' : 'αρχεία'};`)) return;
    await supabase.storage.from('property-files').remove(selRaw.map(i => i.raw!.file_path));
    await supabase.from('property_documents').delete().in('id', selRaw.map(i => i.raw!.id));
    setSelected(new Set()); fetchAll();
  };
  const bulkDownload = () => { selItems.filter(i => i.url).forEach(i => window.open(i.url!, '_blank', 'noopener')); };

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
    <button onClick={onClick} disabled={!onClick || last}
      style={{ background: 'none', border: 'none', padding: 0, cursor: onClick && !last ? 'pointer' : 'default',
        fontSize: 13, fontWeight: last ? 700 : 500, fontFamily: T.font.sans,
        color: last ? 'var(--text-primary)' : 'var(--accent)' }}>{label}</button>
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
  // Όταν το αρχείο είναι κενό, το κουμπί «Νέο αρχείο» ζει ΜΟΝΟ στην κενή κατάσταση
  // (κεντρικό CTA) — αποφεύγουμε διπλότυπο κουμπί στην κεφαλίδα.
  const headerActions = (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {items.length > 0 && <ExportButton onClick={exportCsv} />}
      {items.length > 0 && uploadBtn}
    </div>
  );
  const fileActions = (showFolder: boolean): FileActions => ({
    view, showFolder, selected,
    onToggleSel: toggleSel, onOpenLightbox: setLightbox,
    onDelete: del, onRename: setRenameItem, onMove: it => setMoveItems([it]),
  });

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>
      {!embedded && (
        <PageTitle title="Αρχείο"
          sub="Ένας οργανωμένος ψηφιακός φάκελος: συμβόλαια, έγγραφα, φόροι, λογαριασμοί, πάροχοι, εγγυήσεις, τιμολόγια και φωτογραφίες, αυτόματα ταξινομημένα ώστε να τα βρίσκεις με 2 κλικ"
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
        <div className="card" style={{ marginBottom: 20 }}>
          <SecHdr label="Αρχειοθέτηση νέου αρχείου" sub={uploadMin ? undefined : 'Σύρε ή επίλεξε πολλά αρχεία μαζί, αναγνωρίζονται και τοποθετούνται αυτόματα στον σωστό φάκελο'}
            right={<button onClick={() => setUploadMin(m => !m)} title={uploadMin ? 'Ανάπτυξη' : 'Ελαχιστοποίηση'} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 2 }}>
              {uploadMin ? <svg {...S} width={16} height={16}><path d="m6 9 6 6 6-6"/></svg> : <IconX/>}
            </button>}/>

          {!uploadMin && (<>
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.btn, padding: 4, marginBottom: 14, width: 'fit-content' }}>
            {([['document', 'Έγγραφο'], ['photo', 'Φωτογραφία']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setForm(f => ({ ...f, kind: k }))}
                style={{ padding: '7px 16px', borderRadius: T.radius.btn, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: form.kind === k ? 700 : 500, fontFamily: T.font.sans, background: form.kind === k ? 'var(--accent)' : 'transparent', color: form.kind === k ? 'var(--accent-text)' : 'var(--text-secondary)' }}>{l}</button>
            ))}
          </div>

          {/* Αυτόματη αναγνώριση (AI) — έγγραφα (OCR) & φωτογραφίες (vision) */}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 14, cursor: 'pointer', userSelect: 'none' }}>
            <span style={{ position: 'relative', width: 34, height: 20, borderRadius: T.radius.pill, background: autoDetect ? 'var(--accent)' : 'var(--border-default)', transition: `background 0.18s ${T.ease.standard}`, flexShrink: 0 }}>
              <span style={{ position: 'absolute', top: 2, left: autoDetect ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: `left 0.18s ${T.ease.standard}` }}/>
            </span>
            <input type="checkbox" checked={autoDetect} onChange={e => setAutoDetect(e.target.checked)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}/>
            <span style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Αυτόματη αναγνώριση (AI)</span>
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{form.kind === 'photo'
                ? 'αναγνωρίζει τον χώρο/θέμα και την κατηγορία (ζημιά, ανακαίνιση, εξωτερικός χώρος…) και αρχειοθετεί μόνο του'
                : 'εντοπίζει τύπο, πάροχο & ημερομηνία και αρχειοθετεί μόνο του στον σωστό φάκελο'}</span>
            </span>
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 14, marginBottom: 14 }}>
            <CustomSelect label={autoOn ? 'Κατηγορία (εφεδρική)' : 'Κατηγορία (φάκελος)'} value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))}
              options={(form.kind === 'photo' ? PHOTO_CATEGORIES : DOC_CATEGORIES).map(c => ({ value: c, label: c }))}/>
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 6, fontFamily: T.font.sans }}>Προμηθευτής / Πάροχος</label>
              <input list="supplier-suggestions" value={form.supplier}
                onChange={e => { const v = e.target.value; setForm(f => { const next = { ...f, supplier: v }; if (prefs.autoSuggestCategory && f.kind === 'document') { const c = suggestCategory(v); if (c && DOC_CATEGORIES.includes(c)) next.category = c; } return next; }); }}
                placeholder="π.χ. ΔΕΗ, ΕΥΔΑΠ, COSMOTE…"
                style={{ width: '100%', height: 40, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: T.radius.inner, padding: '0 14px', color: 'var(--text-primary)', fontSize: 13, fontFamily: T.font.sans, outline: 'none', boxSizing: 'border-box' }}/>
              {/* Προτάσεις ΑΝΑ κατηγορία (σωστοί πάροχοι για το είδος), με εφεδρεία τους συνήθεις */}
              <datalist id="supplier-suggestions">{(form.kind === 'document' ? (CATEGORY_SUPPLIERS[form.category] ?? COMMON_SUPPLIERS) : COMMON_SUPPLIERS).map(s => <option key={s} value={s}/>)}</datalist>
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
                ? (autoOn ? 'Αυτόματη αναγνώριση & αρχειοθέτηση φωτογραφιών · PNG, JPEG, WebP…' : 'Πολλαπλές φωτογραφίες μαζί · PNG, JPEG, WebP…')
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
          </>)}
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
          {query && <button onClick={() => setQuery('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 13 }}><IconX/></button>}
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

      {/* ── Μπάρα μαζικών ενεργειών (όταν υπάρχει επιλογή) ───────────────── */}
      {selected.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '10px 14px', marginBottom: 16, flexWrap: 'wrap', boxShadow: 'var(--shadow-sm)' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.sans, whiteSpace: 'nowrap' }}>{selected.size} {selected.size === 1 ? 'επιλεγμένο' : 'επιλεγμένα'}</span>
          <div style={{ width: 1, height: 20, background: 'var(--border-subtle)', flexShrink: 0 }}/>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <BulkBtn icon={<IconDownload/>} label="Λήψη" onClick={bulkDownload} disabled={!selItems.some(i => i.url)}/>
            <BulkBtn icon={<IconMoveFolder/>} label="Μετακίνηση" onClick={() => selDocs.length && setMoveItems(selDocs)} disabled={!selDocs.length}/>
            <BulkBtn icon={<IconTrash/>} label="Διαγραφή" onClick={bulkDelete} disabled={!selRaw.length} danger/>
          </div>
          <button onClick={() => setSelected(new Set())} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: T.radius.btn, border: 'none', background: 'transparent', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: T.font.sans }}><IconX/>Άκυρο</button>
        </div>
      )}

      {/* ── Περιεχόμενο ─────────────────────────────────────────────────── */}
      {loading ? <Spinner label="Φόρτωση αρχείου…"/> :
        q ? (
          <FileList items={searchResults ?? []} a={fileActions(true)}
            empty={<EmptyState title="Κανένα αποτέλεσμα" hint={`Δεν βρέθηκε αρχείο για «${query}».`}/>}/>
        ) : !folderKey ? (
          /* Επίπεδο 0: φάκελοι κατηγοριών */
          items.length === 0 ? (
            <div className="card"><EmptyState title="Το αρχείο είναι κενό"
              hint="Ανέβασε το πρώτο συμβόλαιο, λογαριασμό ή τιμολόγιο. Ό,τι καταχωρείς στα Έξοδα, τους Λογαριασμούς ή την Απογραφή αρχειοθετείται κι εδώ αυτόματα."
              action={showUpload ? undefined : <Btn variant="primary" onClick={() => setShowUpload(true)}>Νέο αρχείο</Btn>}/></div>
          ) : view === 'grid' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
              {FOLDERS.filter(f => counts.count[f.key]).map(f => <FolderCardGrid key={f.key} k={f.key} label={f.label} count={counts.count[f.key]} value={isPro ? counts.value[f.key] : undefined} onClick={() => openFolder(f.key)}/>)}
            </div>
          ) : (
            <div className="card" style={{ padding: 8 }}>
              {FOLDERS.filter(f => counts.count[f.key]).map(f => <FolderRow key={f.key} k={f.key} label={f.label} count={counts.count[f.key]} value={isPro ? counts.value[f.key] : undefined} onClick={() => openFolder(f.key)}/>)}
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
          <FileList items={subItems.sort(byDateDesc)} groupByMonth={subMode === 'date'} a={fileActions(false)}
            empty={<EmptyState title="Κανένα αρχείο εδώ"/>}/>
        )}

      {/* ── Lightbox (εικόνα ή προεπισκόπηση PDF) ───────────────────────── */}
      {lightbox && lightbox.url && (
        <div onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, flexDirection: 'column', gap: 12 }}>
          <button onClick={() => setLightbox(null)} title="Κλείσιμο" style={{ position: 'absolute', top: 18, right: 18, width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.14)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IconX size={16}/></button>
          {isPdfItem(lightbox)
            ? <iframe title={lightbox.title} src={lightbox.url} onClick={e => e.stopPropagation()} style={{ width: 'min(100%, 900px)', height: '82%', border: 'none', borderRadius: T.radius.inner, background: '#fff' }}/>
            : <img src={lightbox.url} alt={lightbox.title} onClick={e => e.stopPropagation()} style={{ maxWidth: '92%', maxHeight: '82%', objectFit: 'contain', borderRadius: T.radius.inner }}/>}
          <div style={{ color: '#fff', fontSize: 12, fontFamily: T.font.sans, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700 }}>{lightbox.title}</div>
            <div style={{ opacity: 0.7, marginTop: 2 }}>{[lightbox.category, lightbox.provider, lightbox.date ? fd(lightbox.date) : null].filter(Boolean).join(' · ')}</div>
            <a href={lightbox.url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 11, fontWeight: 600, color: '#fff', textDecoration: 'none', padding: '7px 14px', borderRadius: T.radius.pill, background: 'rgba(255,255,255,0.14)' }}><IconDownload size={13}/>Άνοιγμα σε νέα καρτέλα</a>
          </div>
        </div>
      )}

      {/* ── Μετονομασία ──────────────────────────────────────────────────── */}
      {renameItem && <RenameModal initial={renameItem.title} onCancel={() => setRenameItem(null)} onSave={applyRename}/>}

      {/* ── Μετακίνηση σε φάκελο (αλλαγή κατηγορίας) ─────────────────────── */}
      {moveItems && moveItems.length > 0 && <MoveModal count={moveItems.length} onCancel={() => setMoveItems(null)} onMove={applyMove}/>}
    </div>
  );
}

/* ── Ταξινόμηση κατά ημερομηνία (φθίνουσα) ──────────────────────────────── */
function byDateDesc(a: Item, b: Item) {
  const ad = a.date ? new Date(a.date).getTime() : 0;
  const bd = b.date ? new Date(b.date).getTime() : 0;
  return bd - ad;
}

/* ── Κάρτα φακέλου (πλέγμα) ── εμφανίζονται μόνο φάκελοι με περιεχόμενο ──────── */
function FolderCardGrid({ k, label, count, value, onClick }: { k: FolderKey; label: string; count: number; value?: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className="card" style={{ textAlign: 'left', cursor: 'pointer', padding: 16, margin: 0, display: 'flex', flexDirection: 'column', gap: 12, border: '1px solid var(--border-subtle)', transition: `border-color 0.16s ${T.ease.standard}, transform 0.16s ${T.ease.standard}, box-shadow 0.16s ${T.ease.standard}` }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-border)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ width: 42, height: 42, borderRadius: T.radius.inner, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <FolderGlyph k={k}/>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.badge, padding: '2px 9px' }}>{count}</span>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
          {value != null && value > 0 ? fe(value) : `${count} ${count === 1 ? 'αρχείο' : 'αρχεία'}`}
        </div>
      </div>
    </button>
  );
}

function FolderRow({ k, label, count, value, onClick }: { k: FolderKey; label: string; count: number; value?: number; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'transparent', border: 'none', borderRadius: T.radius.inner, cursor: 'pointer' }}
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
    <button onClick={onClick} className="card" style={{ textAlign: 'left', cursor: 'pointer', padding: 16, margin: 0, display: 'flex', flexDirection: 'column', gap: 12, border: '1px solid var(--border-subtle)', transition: `border-color 0.16s ${T.ease.standard}, transform 0.16s ${T.ease.standard}, box-shadow 0.16s ${T.ease.standard}` }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-border)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ width: 42, height: 42, borderRadius: T.radius.inner, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <SubfolderGlyph mode={mode}/>
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
      <span style={{ color: 'var(--text-secondary)', display: 'flex' }}><SubfolderGlyph mode={mode} size={18}/></span>
      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{name}</span>
      <span style={{ fontSize: 11, fontWeight: 700, fontFamily: T.font.mono, color: 'var(--text-secondary)' }}>{count}</span>
      <svg {...S} width={15} height={15} style={{ color: 'var(--text-tertiary)' }}><path d="m9 18 6-6-6-6"/></svg>
    </button>
  );
}

/* ── Λίστα αρχείων ───────────────────────────────────────────────────────── */
interface FileActions {
  view: 'grid' | 'list'; showFolder?: boolean; selected: Set<string>;
  onToggleSel: (id: string) => void; onOpenLightbox: (i: Item) => void;
  onDelete: (i: Item) => void; onRename: (i: Item) => void; onMove: (i: Item) => void;
}
const isPdfItem = (i: Item) => /pdf/i.test(i.raw?.mime || '') || /\.pdf($|\?)/i.test(i.url || '');
const canPreview = (i: Item) => !!i.url && (i.isImage || isPdfItem(i));

function FileList({ items, groupByMonth, empty, a }: { items: Item[]; groupByMonth?: boolean; empty: React.ReactNode; a: FileActions }) {
  if (items.length === 0) return <div className="card">{empty}</div>;
  if (groupByMonth) {
    const groups = new Map<string, Item[]>();
    items.forEach(i => { const key = i.date ? monthLabel(i.date) : 'Χωρίς ημερομηνία'; (groups.get(key) ?? groups.set(key, []).get(key)!).push(i); });
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {Array.from(groups.entries()).map(([m, its]) => (
          <div key={m} className="card" style={{ margin: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-tertiary)' }}/>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.06em', textTransform: 'capitalize' as const }}>{m}</span>
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{its.length} {its.length === 1 ? 'αρχείο' : 'αρχεία'}</span>
            </div>
            <FileInner items={its} a={a}/>
          </div>
        ))}
      </div>
    );
  }
  return <div className="card"><FileInner items={items} a={a}/></div>;
}

function FileInner({ items, a }: { items: Item[]; a: FileActions }) {
  if (a.view === 'grid') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        {items.map(i => <FileCard key={i.id} i={i} a={a}/>)}
      </div>
    );
  }
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{items.map(i => <FileRow key={i.id} i={i} a={a}/>)}</div>;
}

// Στρογγυλό κουμπί ενέργειας πάνω από thumbnail (grid) — σκουρόχρωμο για αντίθεση.
const OverlayBtn = ({ title, onClick, children }: { title: string; onClick: (e: React.MouseEvent) => void; children: React.ReactNode }) => (
  <button onClick={onClick} title={title}
    style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' }}>{children}</button>
);

function FileCard({ i, a }: { i: Item; a: FileActions }) {
  const [hov, setHov] = useState(false);
  const sel = a.selected.has(i.id);
  const preview = canPreview(i);
  const canMove = !!i.raw && i.raw.kind === 'document';
  const selectable = !!i.raw || !!i.url;   // τα «εικονικά» στοιχεία (π.χ. λογαριασμοί χωρίς αρχείο) δεν επιλέγονται
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ borderRadius: T.radius.inner, overflow: 'hidden', border: `1.5px solid ${sel ? 'var(--accent)' : 'var(--border-subtle)'}`, background: 'var(--bg-elevated)', boxShadow: sel ? '0 0 0 3px var(--accent-soft)' : 'none', transition: `border-color 0.14s ${T.ease.standard}, box-shadow 0.14s ${T.ease.standard}` }}>
      <div style={{ position: 'relative', aspectRatio: '4 / 3', background: 'var(--bg-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: preview ? 'pointer' : 'default' }}
        onClick={() => { if (preview) a.onOpenLightbox(i); }}>
        {i.isImage && i.url
          ? <img src={i.url} alt={i.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
          : <span style={{ color: 'var(--accent)' }}><svg {...S} width={30} height={30}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span>}
        {isPdfItem(i) && <span style={{ position: 'absolute', bottom: 6, left: 6, fontSize: 8, fontWeight: 800, letterSpacing: '0.05em', color: '#fff', background: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: 5 }}>PDF</span>}
        {selectable && (hov || sel) && <div style={{ position: 'absolute', top: 6, left: 6 }} onClick={e => e.stopPropagation()}><SelectBox checked={sel} onToggle={() => a.onToggleSel(i.id)}/></div>}
        {hov && i.raw && (
          <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 5 }}>
            <OverlayBtn title="Μετονομασία" onClick={e => { e.stopPropagation(); a.onRename(i); }}><IconPencil size={13}/></OverlayBtn>
            {canMove && <OverlayBtn title="Μετακίνηση σε φάκελο" onClick={e => { e.stopPropagation(); a.onMove(i); }}><IconMoveFolder size={13}/></OverlayBtn>}
            <OverlayBtn title="Διαγραφή" onClick={e => { e.stopPropagation(); a.onDelete(i); }}><IconX/></OverlayBtn>
          </div>
        )}
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
  );
}

// Μικρό κουμπί ενέργειας σε γραμμή λίστας (εμφανίζεται στο hover).
const RowBtn = ({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick} title={title}
    style={{ width: 28, height: 28, borderRadius: T.radius.badge, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{children}</button>
);

function FileRow({ i, a }: { i: Item; a: FileActions }) {
  const [hov, setHov] = useState(false);
  const sel = a.selected.has(i.id);
  const canMove = !!i.raw && i.raw.kind === 'document';
  const selectable = !!i.raw || !!i.url;
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 12, background: sel ? 'var(--accent-soft)' : 'var(--bg-elevated)', border: `1px solid ${sel ? 'var(--accent-border)' : 'var(--border-subtle)'}`, borderRadius: T.radius.inner, padding: '10px 14px', transition: `background 0.14s ${T.ease.standard}` }}>
      <div style={{ width: 18, display: 'flex', flexShrink: 0 }}>{selectable && (hov || sel) && <SelectBox checked={sel} onToggle={() => a.onToggleSel(i.id)}/>}</div>
      {i.isImage && i.url
        ? <img src={i.url} alt="" onClick={() => a.onOpenLightbox(i)} style={{ width: 40, height: 40, borderRadius: T.radius.badge, objectFit: 'cover', flexShrink: 0, cursor: 'pointer', border: '1px solid var(--border-subtle)' }}/>
        : <div onClick={() => { if (canPreview(i)) a.onOpenLightbox(i); }} style={{ width: 40, height: 40, borderRadius: T.radius.badge, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--accent)', cursor: canPreview(i) ? 'pointer' : 'default' }}>
            <svg {...S} width={17} height={17}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 300 }}>{i.title}</span>
          <OriginTag i={i}/>
          {a.showFolder && <span style={{ fontSize: 9, color: 'var(--accent)', fontWeight: 600 }}>{FOLDER_LABEL[i.folder]}</span>}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
          {[i.date ? fd(i.date) : null, i.sizeBytes ? fmtSize(i.sizeBytes) : null, i.note].filter(Boolean).join(' · ')}
        </div>
      </div>
      {i.value != null && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.mono, whiteSpace: 'nowrap' }}>{fe(i.value)}</span>}
      {hov && i.raw && (
        <>
          <RowBtn title="Μετονομασία" onClick={() => a.onRename(i)}><IconPencil size={14}/></RowBtn>
          {canMove && <RowBtn title="Μετακίνηση σε φάκελο" onClick={() => a.onMove(i)}><IconMoveFolder size={14}/></RowBtn>}
        </>
      )}
      {i.url && <a href={i.url} target="_blank" rel="noopener noreferrer"
        style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none', padding: '6px 12px', border: '1px solid var(--accent-border)', borderRadius: T.radius.badge, whiteSpace: 'nowrap' }}>Άνοιγμα</a>}
      {i.raw && <RowBtn title="Διαγραφή" onClick={() => a.onDelete(i)}><IconX/></RowBtn>}
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

/* ── Modals (μετονομασία / μετακίνηση) ───────────────────────────────────── */
function ModalShell({ title, sub, children, onCancel, onConfirm, confirmLabel, confirmDisabled }: {
  title: string; sub?: string; children: React.ReactNode; onCancel: () => void; onConfirm: () => void; confirmLabel: string; confirmDisabled?: boolean;
}) {
  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 440, margin: 0 }}>
        <SecHdr label={title} sub={sub}/>
        <div style={{ marginBottom: 18 }}>{children}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" onClick={onCancel}>Άκυρο</Btn>
          <Btn variant="primary" onClick={onConfirm} disabled={confirmDisabled}>{confirmLabel}</Btn>
        </div>
      </div>
    </div>
  );
}

function RenameModal({ initial, onCancel, onSave }: { initial: string; onCancel: () => void; onSave: (v: string) => void }) {
  const [val, setVal] = useState(initial);
  return (
    <ModalShell title="Μετονομασία" onCancel={onCancel} onConfirm={() => val.trim() && onSave(val)} confirmLabel="Αποθήκευση" confirmDisabled={!val.trim()}>
      <TextInput label="Νέο όνομα" value={val} onChange={setVal} placeholder="Όνομα αρχείου"/>
    </ModalShell>
  );
}

function MoveModal({ count, onCancel, onMove }: { count: number; onCancel: () => void; onMove: (category: string) => void }) {
  const [cat, setCat] = useState(DOC_CATEGORIES[0]);
  return (
    <ModalShell title={count > 1 ? `Μετακίνηση ${count} αρχείων` : 'Μετακίνηση σε φάκελο'}
      sub="Διάλεξε κατηγορία, ο φάκελος ενημερώνεται αυτόματα." onCancel={onCancel} onConfirm={() => onMove(cat)} confirmLabel="Μετακίνηση">
      <CustomSelect label="Κατηγορία" value={cat} onChange={setCat}
        options={DOC_CATEGORIES.map(c => ({ value: c, label: `${c}  →  ${FOLDER_LABEL[folderForDoc(c)]}` }))}/>
    </ModalShell>
  );
}
