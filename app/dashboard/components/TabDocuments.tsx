'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, fd, fe, fn, KPIGrid, Skeleton, EmptyState, InfoBanner, PageTitle, SecHdr, Badge, Btn, ExportButton, ABSENT_DATE } from '@/components/Theme';
import { useCoarsePointer } from '@/components/useCoarsePointer';
import { SearchX, FolderOpen, FileText } from 'lucide-react';
import { confirmDialog } from '@/components/ConfirmDialog';
import { CustomSelect, TextInput, DatePicker, Textarea, NumberInput } from './UIComponents';
import { downloadCsv } from './exportCsv';
import { saved } from '@/components/dbWrite';
import { money } from './xlsxStyle';
import { useAppPreferences } from './useAppPreferences';
// Η ΜΙΑ μηχανή σάρωσης/καταχώρισης. Το Αρχείο δεν έχει δική του λογική OCR, δικό
// του prompt, ούτε δική του απόφαση για το ράφι: όλα ζουν στο scanDoc.ts και στο
// lib/billing (δοκιμασμένα). Ό,τι φαίνεται εδώ είναι μόνο οθόνη.
import { ARCHIVE_CATEGORIES, validateDoc, DOC_FIELD_LABELS, DOC_TYPE_LABELS, type ScannedDoc } from '@/lib/billing/documents';
import {
  scanFile, commitScannedDoc, archiveScannedFile, archiveCategoryFor,
  PHOTO_CATEGORIES, MAX_SCAN_MB, type ScanError, type ReconcileQuestion,
} from './scanDoc';
import { isValidAfm } from '@/lib/billing/parse';
import {
  applyFilters, facetOptions, toggleValue, clearAll, groupByMonth, sumValues,
  activeFacetCount, isSelectionEmpty, FACET_KEYS, FACET_LABEL,
  type Selection, type TimeGroup,
} from '@/lib/archive/facets';

/* ════════════════════════════════════════════════════════════════════════
   ΑΡΧΕΙΟ — μία επίπεδη λίστα με όψεις, ΧΩΡΙΣ φακέλους.
   Συγκεντρώνει σε ΕΝΑ σημείο χαρτιά από τέσσερις πηγές. Κάθε χαρτί κρατά τις
   ιδιότητές του (κατηγορία, πάροχος, χρονιά, προέλευση) και ο χρήστης τις
   συνδυάζει — δεν κατεβαίνει σε δέντρο. Το γιατί, και η λογική με τα τεστ της,
   ζουν στο lib/archive/facets.ts.
   Πηγές δεδομένων:
     • property_documents  — τα ανεβασμένα αρχεία/φωτογραφίες (μοναδική εγγράψιμη πηγή)
     • expenses.attachment_url — αποδείξεις/τιμολόγια που επισυνάφθηκαν στα Έξοδα
     • bills               — λογαριασμοί (χωρίς αρχείο· εικονική καρτέλα ανά πάροχο/ημ/αξία)
     • inventory_items     — εγγυήσεις εξοπλισμού (με φωτογραφία προϊόντος όπου υπάρχει)
   ════════════════════════════════════════════════════════════════════════ */

interface Props { propertyId: string; userId: string; }

// Η γραμμή του Αρχείου. Τα πέντε νέα πεδία (ποσό, ΑΦΜ παρόχου, περίοδος από–έως,
// ημ. έκδοσης) είναι προαιρετικά στον τύπο επειδή σε βάση όπου δεν έχει τρέξει
// ακόμη το migration 20260730090000 απλώς δεν επιστρέφονται.
interface DocRow {
  id: string; property_id: string; kind: 'photo' | 'document';
  category: string | null; supplier: string | null; title: string | null; notes: string | null;
  doc_date: string | null; file_path: string; file_name: string | null;
  mime: string | null; size_bytes: number | null; created_at: string;
  amount?: number | string | null; provider_afm?: string | null;
  period_from?: string | null; period_to?: string | null; issue_date?: string | null;
  signedUrl?: string;
}

// Οι κατηγορίες-φάκελοι έρχονται από το lib/billing/documents.ts — ΕΝΑ σημείο για
// όλες τις διαδρομές (σάρωση, μαζικό ανέβασμα, διόρθωση αναγνώρισης).
const DOC_CATEGORIES: string[] = [...ARCHIVE_CATEGORIES];

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
  // Τα τρία πεδία των όψεων. Παράγονται σε ΕΝΑ σημείο (enrich, πριν το setItems)
  // αντί να γράφονται σε καθεμία από τις τέσσερις πηγές — έτσι η ετικέτα
  // κατηγορίας δεν μπορεί να διαφωνήσει ανάμεσα σε έγγραφο, έξοδο και λογαριασμό.
  categoryLabel: string;
  sourceLabel: string;
  afm: string | null;
}
const ORIGIN_LABEL: Record<Source, string | null> = { document: null, expense: 'Έξοδα', bill: 'Λογαριασμοί', inventory: 'Απογραφή' };

// Οι τέσσερις πηγές χτίζουν το κοινό σχήμα ΧΩΡΙΣ τα πεδία των όψεων· τα
// συμπληρώνει το enrich παρακάτω, μία φορά για όλες.
type RawItem = Omit<Item, 'categoryLabel' | 'sourceLabel' | 'afm'>;
const enrich = (i: RawItem): Item => ({
  ...i,
  categoryLabel: FOLDER_LABEL[i.folder],
  sourceLabel: ORIGIN_LABEL[i.source] ?? 'Αρχείο',
  afm: i.raw?.provider_afm ?? null,
});

/* ── Η ουρά σάρωσης → επιβεβαίωσης → καταχώρισης ──────────────────────────
   ΔΕΝ υπάρχει ποσοστό. Το προηγούμενο «pct = done ? 100 : uploading ? 70 : ocr
   ? 35 : 12» ήταν τέσσερις σταθερές που δεν μέτραγαν τίποτα, παρουσιασμένες ως
   πρόοδος: μια σάρωση 40 δευτερολέπτων έδειχνε ακίνητο 35%. Τώρα λέμε ποιο
   στάδιο τρέχει, με λέξεις. */
type DraftStatus = 'pending' | 'scanning' | 'ready' | 'failed' | 'saving' | 'saved' | 'error';
interface Draft {
  id: string;
  file: File;
  status: DraftStatus;
  /** Το AI αποφασίζει αν είναι παραστατικό ή φωτογραφία χώρου — όχι διακόπτης. */
  kind: 'document' | 'photo';
  doc?: ScannedDoc;                 // kind === 'document'
  category: string;                 // ράφι Αρχείου, προσυμπληρωμένο & διορθώσιμο
  photoTitle?: string;              // kind === 'photo'
  scanError?: ScanError;
  /** Ερώτηση συμφωνίας: ποιον εκκρεμή λογαριασμό εξοφλεί αυτή η απόδειξη. */
  ask?: ReconcileQuestion;
  /** Τι ενημερώθηκε πραγματικά (ειλικρινής αναφορά, όχι υπόσχεση). */
  saved?: string[];
  errorText?: string;
  open: boolean;
}

const fmtSize = (b: number | null) => {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
};
const yearOf = (d: string | null) => (d ? String(new Date(d).getFullYear()) : null);

// Το `amount` του παραστατικού μπορεί να επιστραφεί ως string (numeric της PG) ή
// να λείπει τελείως (βάση χωρίς το migration). null σημαίνει «δεν ξέρω», όχι 0.
const numOrNull = (v: unknown): number | null => {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim()) { const n = parseFloat(v); return isFinite(n) ? n : null; }
  return null;
};
// Η περίοδος δαπάνης, όπως διαβάζεται από τον άνθρωπο.
const periodLabel = (r: { period_from?: string | null; period_to?: string | null }): string => {
  if (r.period_from && r.period_to) return `Περίοδος ${fd(r.period_from)} – ${fd(r.period_to)}`;
  if (r.period_from) return `Περίοδος από ${fd(r.period_from)}`;
  if (r.period_to) return `Περίοδος έως ${fd(r.period_to)}`;
  return '';
};

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

  // ── ΟΨΕΙΣ ΑΝΤΙ ΓΙΑ ΦΑΚΕΛΟΥΣ ──────────────────────────────────────────────
  // Πριν εδώ ζούσε πλοήγηση τριών επιπέδων: folderKey → subKey → αρχεία. Κάθε
  // χαρτί ήταν αναγκασμένο να διαλέξει ΕΝΑ σπίτι, ενώ ένα μισθωτήριο είναι
  // ταυτόχρονα συμβόλαιο, φορολογικό και χαρτί του ενοικιαστή. Οι ερωτήσεις που
  // κάνει πραγματικά ο ιδιοκτήτης («όλα του 2025 για τον λογιστή», «όλα της ΔΕΗ»)
  // κόβουν κάθετα σε κάθε φάκελο, οπότε με δέντρο απαιτούσαν άνοιγμα-κλείσιμο σε
  // δέκα σημεία. Τώρα: μία επίπεδη λίστα και ιδιότητες που συνδυάζονται.
  // Η λογική ζει στο lib/archive/facets.ts, με τα δικά της τεστ.
  const [sel, setSel] = useState<Selection>({});
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [lightbox, setLightbox] = useState<Item | null>(null);

  // Διαχείριση αρχείων (μόνο για ανεβασμένα property_documents)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [fixItems, setFixItems] = useState<Item[] | null>(null);     // «διόρθωση αναγνώρισης»
  const [renameItem, setRenameItem] = useState<Item | null>(null);   // ανοιχτό modal μετονομασίας

  // Σάρωση → επιβεβαίωση → καταχώριση. Καμία χειροκίνητη φόρμα, κανένας διακόπτης.
  const [showUpload, setShowUpload] = useState(false);
  const [uploadMin, setUploadMin] = useState(false);   // ελαχιστοποιημένη (collapsed) κάρτα
  const [busy, setBusy] = useState(false);             // σάρωση ή καταχώριση σε εξέλιξη
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

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

    const out: RawItem[] = [];

    // 1) property_documents — πρωτογενή αρχεία & φωτογραφίες
    docs.forEach(r => {
      const img = (r.mime || '').startsWith('image/');
      out.push({
        id: `doc:${r.id}`, source: 'document',
        folder: r.kind === 'photo' ? 'photos' : folderForDoc(r.category),
        title: r.title || r.file_name || 'Έγγραφο',
        provider: r.supplier,
        // Ημερομηνία ταξινόμησης: έκδοση → doc_date → λήψη. Η έκδοση είναι το
        // πραγματικό γεγονός του παραστατικού και προηγείται.
        date: r.issue_date || r.doc_date || r.created_at,
        // ΤΟ ΠΟΣΟ ΤΟΥ ΧΑΡΤΙΟΥ. Μέχρι σήμερα εδώ έγραφε σταθερά `null` για ΚΑΘΕ
        // σαρωμένο έγγραφο, οπότε η «Καταγεγραμμένη αξία» άθροιζε μόνο κάτοπτρα.
        value: numOrNull(r.amount),
        url: signedMap[r.file_path] ?? null, isImage: img, sizeBytes: r.size_bytes,
        note: [r.notes, periodLabel(r), r.provider_afm ? `ΑΦΜ ${r.provider_afm}` : ''].filter(Boolean).join(' · ') || null,
        category: r.category, raw: { ...r, signedUrl: signedMap[r.file_path] },
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

    setItems(out.map(enrich));
    setLoading(false);
  }, [propertyId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  // Καθάρισε την επιλογή όταν αλλάζει το πλαίσιο πλοήγησης (φάκελος/υποφάκελος/αναζήτηση).
  useEffect(() => { setSelected(new Set()); }, [sel, query]);
  // Esc: κλείσιμο lightbox.
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  /* ══════════════════════════════════════════════════════════════════════
     Η ΡΟΗ: φωτογραφία → αναγνώριση → επιβεβαίωση → καταχώριση παντού.
     Τι έφυγε από εδώ και γιατί:
       • Ο διακόπτης «Αυτόματη αναγνώριση (AI)» — δεν είναι επιλογή, είναι η ροή.
       • Ο διακόπτης Έγγραφο/Φωτογραφία — το AI τα ξεχωρίζει (scanFile).
       • Τα πέντε πεδία χειροκίνητης καταχώρισης — η αναγνώριση τα γράφει και ο
         χρήστης τα διορθώνει στην οθόνη επιβεβαίωσης, όπου φαίνεται και τι λείπει.
       • Οι ~90 σταθεροί πάροχοι και τα 13 regex: υπήρχαν αποκλειστικά για το
         datalist της πληκτρολόγησης. Ο πάροχος διαβάζεται από το χαρτί, και η
         κατηγορία προκύπτει από τους MATCHERS του lib/billing/parse.ts.
     ══════════════════════════════════════════════════════════════════════ */

  const patch = (id: string, p: Partial<Draft>) =>
    setDrafts(ds => ds.map(d => (d.id === id ? { ...d, ...p } : d)));
  const patchDoc = (id: string, p: Partial<ScannedDoc>) =>
    setDrafts(ds => ds.map(d => (d.id === id && d.doc ? { ...d, doc: { ...d.doc, ...p } } : d)));

  // Σάρωση παρτίδας. Ακολουθιακά (concurrency 1) ώστε να μη φουσκώνει το κόστος
  // των AI κλήσεων ούτε να πιέζεται η βάση.
  const handleFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (!files.length || !propertyId || busy) return;
    setMsg(null); setShowUpload(true); setUploadMin(false); setBusy(true);
    const fresh: Draft[] = files.map((f, i) => ({
      id: `${Date.now()}_${i}_${f.name}`, file: f, status: 'pending',
      kind: 'document', category: 'Άλλο Έγγραφο', open: false,
    }));
    // Προσθήκη, όχι αντικατάσταση: το «Πρόσθεσε κι άλλα» δεν σβήνει όσα ήδη
    // περιμένουν επιβεβαίωση ή απάντηση συμφωνίας.
    setDrafts(ds => [...ds, ...fresh]);

    for (const d of fresh) {
      if (d.file.size > MAX_SCAN_MB * 1024 * 1024) {
        patch(d.id, { status: 'failed', scanError: 'big' });
        continue;
      }
      patch(d.id, { status: 'scanning' });
      const r = await scanFile(d.file);
      if (r.kind === 'photo' && r.photo) {
        patch(d.id, { status: 'ready', kind: 'photo', category: r.photo.category, photoTitle: r.photo.title || '', open: !r.photo.title });
      } else if (r.doc) {
        const cat = archiveCategoryFor(r.doc);
        const v = validateDoc(r.doc);
        // Ανοίγουμε αυτόματα όσα έχουν έλλειψη ή άκυρη τιμή: ο χρήστης βλέπει
        // αμέσως τι δεν διαβάστηκε, χωρίς να ψάξει.
        patch(d.id, { status: 'ready', kind: 'document', doc: r.doc, category: cat, open: v.blocking.length + v.invalid.length + v.recommended.length > 0 });
      } else {
        patch(d.id, { status: 'failed', scanError: r.error || 'unreadable' });
      }
    }
    setBusy(false);
  };

  // Καταχώριση ενός σχεδίου. Για παραστατικό περνά από τη ΜΙΑ μηχανή (γράφει
  // Αρχείο + Λογαριασμούς + Δαπάνες + Ημερολόγιο…). Για φωτογραφία, μόνο Αρχείο.
  const commitDraft = async (d: Draft, choice?: string | null) => {
    patch(d.id, { status: 'saving', errorText: undefined });
    if (d.kind === 'photo') {
      const r = await archiveScannedFile({
        file: d.file, propertyId, userId, kind: 'photo',
        category: d.category, title: (d.photoTitle || '').trim() || d.file.name,
      });
      patch(d.id, r.ok
        ? { status: 'saved', saved: ['Αρχείο'], open: false, ask: undefined }
        : { status: 'error', errorText: 'Δεν αποθηκεύτηκε. Δοκίμασε ξανά.' });
      return r.ok;
    }
    if (!d.doc) return false;
    const r = await commitScannedDoc({
      doc: d.doc, file: d.file, propertyId, userId, archiveCategory: d.category,
      ...(choice !== undefined ? { reconcileChoice: choice } : {}),
    });
    if (r.ask) { patch(d.id, { status: 'ready', ask: r.ask, open: true }); return false; }
    if (r.error || !r.saved.length) {
      patch(d.id, { status: 'error', errorText: 'Δεν αποθηκεύτηκε. Δοκίμασε ξανά.' });
      return false;
    }
    patch(d.id, { status: 'saved', saved: r.saved, open: false, ask: undefined });
    return true;
  };

  // «Καταχώρηση όλων»: σταματά σε όποιο χρειάζεται απάντηση, δεν μαντεύει.
  const commitAll = async () => {
    setBusy(true); setMsg(null);
    let ok = 0, pending = 0;
    for (const d of drafts) {
      if (d.status === 'saved' || d.status === 'failed') continue;
      // Όσα περιμένουν απάντηση συμφωνίας ΔΕΝ τα κρίνουμε εμείς εκ νέου: ο χρήστης
      // ρωτήθηκε και δεν έχει απαντήσει. Το «καταχώρηση όλων» δεν απαντά για αυτόν.
      if (d.ask) { pending++; continue; }
      const done = await commitDraft(d);
      if (done) ok++; else pending++;
    }
    setBusy(false);
    fetchAll();
    setMsg(ok === 0 && pending === 0
      ? { text: 'Τίποτα δεν καταχωρήθηκε', error: true }
      : pending
        ? { text: `${ok} καταχωρήθηκαν · ${pending} χρειάζονται απάντηση ή διόρθωση`, error: false }
        : { text: ok === 1 ? 'Καταχωρήθηκε' : `${ok} καταχωρήθηκαν`, error: false });
  };

  const clearDrafts = () => { setDrafts([]); setMsg(null); };


  const del = async (it: Item) => {
    if (!it.raw) return;
    // Ο έλεγχος της σημαίας ΠΡΕΠΕΙ να μείνει ΠΡΙΝ το await: αν ο διάλογος καλούνταν
    // πρώτος και ελεγχόταν μετά, θα εμφανιζόταν και σε όσους τον έχουν απενεργοποιήσει
    // στις προτιμήσεις — λειτουργικά «σωστό», σιωπηλά λάθος ως προς την επιλογή τους.
    if (prefs.confirmBeforeDelete && !(await confirmDialog('Να διαγραφεί οριστικά αυτό το αρχείο;', { tone: 'negative' }))) return;
    await supabase.storage.from('property-files').remove([it.raw.file_path]);
    // Αν χαθεί η γραμμή αλλά μείνει το αρχείο, ή το αντίστροφο, ο χρήστης βλέπει
    // το αρχείο να «επιστρέφει» στην επόμενη φόρτωση. Καλύτερα να το μάθει τώρα.
    if (!await saved('Το αρχείο δεν διαγράφηκε', supabase.from('property_documents').delete().eq('id', it.raw.id))) return;
    if (lightbox?.id === it.id) setLightbox(null);
    fetchAll();
  };

  // ── Διαχείριση (μετονομασία / διόρθωση αναγνώρισης / μαζικές ενέργειες) ──
  // Ενημερώνει μόνο ανεβασμένα αρχεία (property_documents)· τα κατοπτρικά
  // στοιχεία (Έξοδα/Λογαριασμοί/Απογραφή) διαχειρίζονται στην πηγή τους.
  // Αμυντικά: αν λείπει κάποια από τις νέες στήλες (βάση χωρίς το migration),
  // ξαναδοκιμάζουμε χωρίς αυτήν, ώστε η διόρθωση να μη χάνεται σιωπηλά.
  const FIX_COLS = ['amount', 'provider_afm', 'period_from', 'period_to', 'issue_date', 'supplier'];
  const updateDocs = async (its: Item[], p: Record<string, unknown>) => {
    const rawIds = its.filter(i => i.raw).map(i => i.raw!.id);
    if (!rawIds.length) return;
    const payload = { ...p };
    for (let i = 0; i <= FIX_COLS.length; i++) {
      const { error } = await supabase.from('property_documents').update(payload).in('id', rawIds);
      if (!error) break;
      const missing = FIX_COLS.find(c => c in payload && new RegExp(`\\b${c}\\b`, 'i').test(error.message));
      if (!missing) break;
      delete payload[missing];
    }
    fetchAll();
  };
  const applyRename = async (title: string) => { if (renameItem && title.trim()) await updateDocs([renameItem], { title: title.trim().slice(0, 200) }); setRenameItem(null); };
  const applyFix = async (p: Record<string, unknown>) => { if (fixItems?.length) await updateDocs(fixItems, p); setFixItems(null); setSelected(new Set()); };

  const toggleSel = (id: string) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selItems = useMemo(() => items.filter(i => selected.has(i.id)), [items, selected]);
  const selDocs = useMemo(() => selItems.filter(i => i.raw && i.raw.kind === 'document'), [selItems]);
  const selRaw = useMemo(() => selItems.filter(i => i.raw), [selItems]);
  const bulkDelete = async () => {
    if (!selRaw.length) return;
    // Το `selRaw` είναι const αυτού του render, άρα το closure το έχει ήδη «παγώσει»:
    // ό,τι διαγραφεί μετά το await είναι ακριβώς όσα μέτρησε το μήνυμα. Επιπλέον ο
    // διάλογος έχει δικό του scrim, οπότε η επιλογή δεν αλλάζει όσο ρωτάει.
    if (prefs.confirmBeforeDelete && !(await confirmDialog(`Να διαγραφούν οριστικά ${selRaw.length} ${selRaw.length === 1 ? 'αρχείο' : 'αρχεία'};`, { tone: 'negative' }))) return;
    await supabase.storage.from('property-files').remove(selRaw.map(i => i.raw!.file_path));
    if (!await saved('Τα αρχεία δεν διαγράφηκαν',
      supabase.from('property_documents').delete().in('id', selRaw.map(i => i.raw!.id)))) return;
    setSelected(new Set()); fetchAll();
  };
  const bulkDownload = () => { selItems.filter(i => i.url).forEach(i => window.open(i.url!, '_blank', 'noopener')); };

  /* ── Παράγωγα δεδομένα ─────────────────────────────────────────────────── */
  const counts = useMemo(() => {
    const c: Record<string, number> = {}; const v: Record<string, number> = {};
    items.forEach(i => { c[i.folder] = (c[i.folder] || 0) + 1; if (i.value) v[i.folder] = (v[i.folder] || 0) + i.value; });
    return { count: c, value: v };
  }, [items]);

  // ── Η ΑΝΕΞΑΡΤΗΤΗ ΑΠΟΔΕΙΞΗ: πόσα λένε ΤΑ ΔΙΚΑ ΜΟΥ ΧΑΡΤΙΑ ────────────────────
  // Αθροίζει ΜΟΝΟ σαρωμένα/ανεβασμένα παραστατικά (source 'document'), όχι τα
  // κάτοπτρα Εξόδων/Λογαριασμών — αλλιώς δεν θα ήταν ανεξάρτητη απόδειξη αλλά
  // επανάληψη των ίδιων καταχωρίσεων. Λέει επίσης πόσα χαρτιά ΔΕΝ έχουν ποσό,
  // ώστε το σύνολο να μη διαβάζεται ως πλήρες όταν δεν είναι.
  const paperTotals = useMemo(() => {
    const docs = items.filter(i => i.source === 'document');
    const byYear = new Map<string, { sum: number; withAmount: number; missing: number }>();
    let sum = 0, withAmount = 0, missing = 0;
    docs.forEach(i => {
      const y = yearOf(i.date) || 'Χωρίς ημερομηνία';
      const e = byYear.get(y) || { sum: 0, withAmount: 0, missing: 0 };
      if (i.value != null) { e.sum += i.value; e.withAmount++; sum += i.value; withAmount++; }
      else { e.missing++; missing++; }
      byYear.set(y, e);
    });
    const years = Array.from(byYear.entries())
      .filter(([, e]) => e.withAmount > 0)
      .sort((a, b) => b[0].localeCompare(a[0]));
    return { sum, withAmount, missing, years, total: docs.length };
  }, [items]);

  const q = query.trim().toLowerCase();

  // Το ΕΝΑ φιλτραρισμένο σύνολο. Αναζήτηση και όψεις μαζί — δεν υπάρχει πια
  // ξεχωριστή «κατάσταση αναζήτησης» που παρέκαμπτε τα φίλτρα.
  const visible = useMemo(() => applyFilters(items, sel, query), [items, sel, query]);

  // Ομαδοποίηση στον χρόνο: ο μόνος άξονας που ο ιδιοκτήτης έχει πάντα στο μυαλό
  // του. Ξέρει περίπου πότε ήρθε ένα χαρτί, ακόμη κι όταν δεν θυμάται πώς το είπε.
  // Το `now` παράγεται εδώ και όχι μέσα στη συνάρτηση, ώστε εκείνη να είναι καθαρή.
  const groups = useMemo(() => groupByMonth(visible, new Date()), [visible]);

  // Οι διαθέσιμες επιλογές κάθε όψης, με μετρητές. Κρύβουμε όψη που δεν προσφέρει
  // πραγματική επιλογή: με μία μόνη τιμή, το φίλτρο δεν φιλτράρει τίποτα και θα
  // ήταν κουμπί που δεν κάνει τίποτα.
  const facets = useMemo(() => FACET_KEYS
    .map(key => ({ key, options: facetOptions(items, key, sel, query) }))
    .filter(f => f.options.length > 1 || f.options.some(o => o.selected)),
    [items, sel, query]);

  const visibleSum = useMemo(() => sumValues(visible), [visible]);
  const filtering = !isSelectionEmpty(sel) || !!q;

  /* ── UI helpers ────────────────────────────────────────────────────────── */

  const photoCount = items.filter(i => i.folder === 'photos').length;
  const docCount = items.length - photoCount;
  const activeCategories = FOLDERS.filter(f => counts.count[f.key]).length;

  const exportCsv = () => downloadCsv('archeio.csv',
    ['Όνομα', 'Φάκελος', 'Πάροχος', 'ΑΦΜ παρόχου', 'Ημερομηνία', 'Περίοδος από', 'Περίοδος έως', 'Αξία (€)', 'Πηγή'],
    items.slice().sort(byDateDesc).map(i => [
      i.title, FOLDER_LABEL[i.folder], i.provider || '', i.raw?.provider_afm || '',
      i.date ? fd(i.date) : '', i.raw?.period_from || '', i.raw?.period_to || '',
      i.value != null ? money(i.value) : '', ORIGIN_LABEL[i.source] || 'Αρχείο',
    ]));

  // Ενιαίο σημείο ανεβάσματος — ζει στο PageTitle (ή στη γραμμή εργαλείων όταν embedded).
  const uploadBtn = (
    <Btn variant="primary" onClick={() => setShowUpload(s => !s)}>
      <svg {...S} width={15} height={15}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>Καταχώριση αρχείου
    </Btn>
  );
  // Όταν το αρχείο είναι κενό, το κουμπί ζει ΜΟΝΟ στην κενή κατάσταση
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
    onDelete: del, onRename: setRenameItem, onFix: it => setFixItems([it]),
  });

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>
      {!embedded && (
        <PageTitle title="Αρχείο"
          sub="Κάθε χαρτί του ακινήτου, αναγνωρισμένο και ταξινομημένο μόνο του"
          right={headerActions}/>
      )}

      {/* ΔΕΝ ΥΠΑΡΧΕΙ ΣΕΙΡΑ ΠΛΑΚΙΔΙΩΝ ΕΔΩ, ΚΑΙ ΕΙΝΑΙ ΣΚΟΠΙΜΟ.
          Τύπωνε «Σύνολο αρχείων · Έγγραφα · Φωτογραφίες · Κατηγορίες» — και τα
          τέσσερα απαντιούνται ήδη παρακάτω, καλύτερα: η γραμμή εργαλείων λέει
          το πλήθος ΑΚΟΛΟΥΘΩΝΤΑΣ τα φίλτρα, και οι όψεις δίνουν το πλήθος κάθε
          κατηγορίας πάνω στο ίδιο το κουμπί που τη φιλτράρει. Το πλακίδιο έλεγε
          τον ίδιο αριθμό ακίνητο, δίπλα σε έναν ζωντανό — και σε άδειο ακίνητο
          τέσσερα μηδενικά πάνω από ένα «δεν έχεις κανένα χαρτί».
          Το μόνο που ΔΕΝ λεγόταν αλλού, η αξία των παραστατικών, ζει τώρα στην
          κάρτα «ανά έτος» — δίπλα στην ανάλυσή της, όχι μακριά της. */}

      {/* Σύνολο ΑΝΑ ΕΤΟΣ, από τα δικά μου χαρτιά. Αυτό είναι το νούμερο που
          αντιπαρατίθεται στο προσυμπληρωμένο της ΑΑΔΕ — γι' αυτό υπάρχει. */}
      {paperTotals.years.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <SecHdr label={`Από τα παραστατικά · ${fe(paperTotals.sum)}`}
            sub={`${fn(paperTotals.withAmount)} ${paperTotals.withAmount === 1 ? 'χαρτί' : 'χαρτιά'} με ποσό${paperTotals.missing ? ` · ${fn(paperTotals.missing)} χωρίς` : ''}. Ανεξάρτητο από Λογαριασμούς και Δαπάνες.`}/>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 160px), 1fr))', gap: 10 }}>
            {paperTotals.years.map(([y, e]) => (
              <div key={y} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '10px 12px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.06em' }}>{y}</div>
                <div style={{ fontSize: 17, fontWeight: 700, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)', marginTop: 2 }}>{fe(e.sum)}</div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  {fn(e.withAmount)} {e.withAmount === 1 ? 'παραστατικό' : 'παραστατικά'}{e.missing ? ` · ${fn(e.missing)} χωρίς ποσό` : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {colWarn && <InfoBanner tone="warning">Ορισμένα Έξοδα δεν διαθέτουν στήλη συνημμένου αρχείου· εμφανίζονται μόνο όσα έχουν επισυναπτόμενη απόδειξη/τιμολόγιο.</InfoBanner>}

      {/* ══ Η ΜΙΑ ΕΠΙΦΑΝΕΙΑ: «Φωτογράφισε ή σύρε» ══════════════════════════ */}
      {showUpload && (
        <div className="card" style={{ marginBottom: 20 }}>
          <SecHdr label="Καταχώριση αρχείων"
            sub={uploadMin ? undefined : 'Λογαριασμός, απόδειξη, μισθωτήριο, ασφαλιστήριο, ΕΝΦΙΑ ή φωτογραφία χώρου. Αναγνωρίζεται, παρουσιάζεται προς έλεγχο, και καταχωρείται όπου ανήκει.'}
            right={<button onClick={() => setUploadMin(m => !m)} title={uploadMin ? 'Ανάπτυξη' : 'Ελαχιστοποίηση'} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 2 }}>
              {uploadMin ? <svg {...S} width={16} height={16}><path d="m6 9 6 6 6-6"/></svg> : <IconX/>}
            </button>}/>

          {!uploadMin && (<>
          {drafts.length === 0 && (
            <>
              <div
                onClick={() => { if (!busy) fileRef.current?.click(); }}
                onDragOver={e => { e.preventDefault(); if (!busy && !dragOver) setDragOver(true); }}
                onDragLeave={e => { e.preventDefault(); setDragOver(false); }}
                onDrop={e => { e.preventDefault(); setDragOver(false); if (!busy && e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files); }}
                style={{ border: `1.5px dashed ${dragOver ? 'var(--accent)' : 'var(--border-default)'}`, background: dragOver ? 'var(--accent-soft)' : 'var(--bg-elevated)', borderRadius: T.radius.card, padding: '30px 20px', textAlign: 'center', cursor: busy ? 'default' : 'pointer', transition: `all 0.18s ${T.ease.standard}` }}>
                <div style={{ color: dragOver ? 'var(--accent)' : 'var(--text-tertiary)', marginBottom: 10, display: 'flex', justifyContent: 'center' }}>
                  <svg {...S} width={28} height={28}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {dragOver ? 'Αφήστε τα αρχεία εδώ' : 'Μεταφορά αρχείων ή επιλογή από τη συσκευή'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 5, lineHeight: 1.5 }}>
                  Φωτογραφία, PDF, Word ή Excel · πολλαπλά αρχεία · έως {MAX_SCAN_MB}MB ανά αρχείο
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <Btn variant="primary" onClick={() => cameraRef.current?.click()} disabled={busy}>
                  <svg {...S} width={15} height={15}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  Λήψη φωτογραφίας
                </Btn>
                <Btn variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}>Επιλογή αρχείων</Btn>
              </div>
            </>
          )}
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
            onChange={e => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ''; }}/>
          <input ref={fileRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" style={{ display: 'none' }}
            onChange={e => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ''; }}/>

          {/* Οθόνη επιβεβαίωσης: ένα σχέδιο ανά αρχείο, προσυμπληρωμένο. */}
          {drafts.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {drafts.map(d => (
                <DraftCard key={d.id} d={d}
                  onToggle={() => patch(d.id, { open: !d.open })}
                  onPatch={p => patch(d.id, p)}
                  onPatchDoc={p => patchDoc(d.id, p)}
                  onCommit={choice => { commitDraft(d, choice).then(ok => { if (ok) fetchAll(); }); }}
                  onRemove={() => setDrafts(ds => ds.filter(x => x.id !== d.id))}/>
              ))}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
                <Btn variant="primary" onClick={commitAll} disabled={busy || drafts.every(d => d.status === 'saved' || d.status === 'failed')}>
                  {busy ? 'Σε εξέλιξη…' : 'Καταχώριση'}
                </Btn>
                <Btn variant="ghost" onClick={clearDrafts} disabled={busy}>Απόρριψη</Btn>
                <Btn variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}>Προσθήκη αρχείων</Btn>
              </div>
            </div>
          )}

          {msg && <div style={{ marginTop: 12, fontSize: 11, fontWeight: 600, color: msg.error ? 'var(--negative)' : 'var(--positive)' }}>{msg.text}</div>}
          </>)}
        </div>
      )}


      {/* ── Γραμμή εργαλείων: σύνοψη + αναζήτηση + προβολή ────────────
          Κρύβεται όταν δεν υπάρχει ούτε ένα χαρτί: αναζήτηση μέσα στο τίποτα και
          εναλλαγή προβολής του τίποτα είναι χειριστήρια χωρίς αντικείμενο. */}
      {!loading && items.length > 0 && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        {/* Αντί για breadcrumb: τι βλέπεις ΤΩΡΑ. Το πλήθος και το άθροισμα
            ακολουθούν τα φίλτρα, γιατί αυτή είναι η ερώτηση του λογιστή
            («πόσα χαρτιά και πόσα ευρώ για το 2025;») — και η απάντηση πρέπει
            να φαίνεται χωρίς να κατεβάσει τίποτα. */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flex: 1, minWidth: 220, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, fontFamily: T.font.sans, color: 'var(--text-primary)' }}>
            {visible.length === items.length
              ? `${items.length} ${items.length === 1 ? 'αρχείο' : 'αρχεία'}`
              : `${visible.length} από ${items.length}`}
          </span>
          {/* Η ανάλυση έγγραφα/φωτογραφίες: ένα υποκείμενο δίπλα στο πλήθος, όχι
              δύο ξεχωριστά πλακίδια. Λέγεται μόνο όταν δεν φιλτράρεις — αλλιώς
              θα μιλούσε για άλλο σύνολο από τον αριθμό δίπλα του. */}
          {!filtering && photoCount > 0 && docCount > 0 && (
            <span style={{ fontSize: 12, fontFamily: T.font.sans, color: 'var(--text-tertiary)' }}>
              {fn(docCount)} έγγραφα · {fn(photoCount)} φωτογραφίες
            </span>
          )}
          {visibleSum > 0 && (
            <span style={{ fontSize: 12, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
              {money(visibleSum)}
            </span>
          )}
          {filtering && (
            <button onClick={() => { setSel(clearAll()); setQuery(''); }}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12,
                fontFamily: T.font.sans, color: 'var(--accent)', textDecoration: 'underline' }}>
              Καθαρισμός φίλτρων
            </button>
          )}
        </div>

        <div style={{ position: 'relative', width: 240, maxWidth: '100%' }}>
          <svg {...S} width={15} height={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }}><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Αναζήτηση σε όλο το αρχείο…"
            style={{ width: '100%', height: T.h.md, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: T.radius.pill, padding: '0 34px 0 34px', color: 'var(--text-primary)', fontSize: 12, fontFamily: T.font.sans, outline: 'none', boxSizing: 'border-box' }}/>
          {query && <button onClick={() => setQuery('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 13 }}><IconX/></button>}
        </div>

        <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border-subtle)', borderRadius: T.radius.badge, overflow: 'hidden' }}>
          {([['grid', 'Πλέγμα', <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>],
             ['list', 'Λίστα', <><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></>]] as const).map(([k, title, ic]) => (
            <button key={k} onClick={() => setView(k)} title={title}
              style={{ width: 38, height: T.h.md, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', background: view === k ? 'var(--accent)' : 'transparent', color: view === k ? 'var(--accent-text)' : 'var(--text-secondary)' }}>
              <svg {...S} width={15} height={15}>{ic}</svg>
            </button>
          ))}
        </div>

        {embedded && headerActions}
      </div>
      )}

      {/* ── Οψεις ────────────────────────────────────────────────────────────
          Οι επιλογές είναι ΠΑΝΤΑ ορατές, όχι κρυμμένες πίσω από «Φίλτρα». Ο
          μετρητής δίπλα σε καθεμία λέει πόσα θα μείνουν αν την πατήσεις, ώστε
          κανείς να μη φτάνει ποτέ σε άδεια οθόνη κατά λάθος. Μια επιλογή με 0
          εμφανίζεται μόνο όταν είναι ήδη πατημένη — τότε είναι η εξήγηση του
          γιατί η λίστα άδειασε, μαζί με τον τρόπο να το αναιρέσεις. */}
      {!loading && items.length > 0 && facets.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {facets.map(({ key, options }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                fontFamily: T.font.sans, color: 'var(--text-tertiary)', width: 78, flexShrink: 0 }}>
                {FACET_LABEL[key]}
              </span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {options.map(o => (
                  <button key={o.value} onClick={() => setSel(s => toggleValue(s, key, o.value))}
                    aria-pressed={o.selected}
                    title={o.selected ? `Αφαίρεση φίλτρου «${o.value}»` : `${o.count} ${o.count === 1 ? 'αρχείο' : 'αρχεία'}`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, height: T.h.sm, padding: '0 12px',
                      borderRadius: T.radius.pill, cursor: 'pointer', fontFamily: T.font.sans,
                      fontSize: 12, fontWeight: o.selected ? 700 : 500,
                      border: `1px solid ${o.selected ? 'var(--accent)' : 'var(--border-subtle)'}`,
                      background: o.selected ? 'var(--accent)' : 'var(--bg-elevated)',
                      color: o.selected ? 'var(--on-tone)' : 'var(--text-secondary)',
                      opacity: !o.selected && o.count === 0 ? 0.45 : 1,
                      transition: `background .15s ${T.ease.standard}, border-color .15s ${T.ease.standard}`,
                    }}>
                    {o.value}
                    <span style={{ fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', fontSize: 10.5,
                      opacity: o.selected ? 0.85 : 0.6 }}>{o.count}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Μπάρα μαζικών ενεργειών (όταν υπάρχει επιλογή) ───────────────── */}
      {selected.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '10px 14px', marginBottom: 16, flexWrap: 'wrap', boxShadow: 'var(--shadow-sm)' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.sans, whiteSpace: 'nowrap' }}>{selected.size} {selected.size === 1 ? 'επιλεγμένο' : 'επιλεγμένα'}</span>
          <div style={{ width: 1, height: 20, background: 'var(--border-subtle)', flexShrink: 0 }}/>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <BulkBtn icon={<IconDownload/>} label="Λήψη" onClick={bulkDownload} disabled={!selItems.some(i => i.url)}/>
            <BulkBtn icon={<IconMoveFolder/>} label="Διόρθωση αναγνώρισης" onClick={() => selDocs.length && setFixItems(selDocs)} disabled={!selDocs.length}/>
            <BulkBtn icon={<IconTrash/>} label="Διαγραφή" onClick={bulkDelete} disabled={!selRaw.length} danger/>
          </div>
          <button onClick={() => setSelected(new Set())} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: T.radius.btn, border: 'none', background: 'transparent', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: T.font.sans }}><IconX/>Άκυρο</button>
        </div>
      )}

      {/* ── Περιεχόμενο ──────────────────────────────────────────────────────
          ΕΝΑ επίπεδο. Πριν εδώ υπήρχαν τρία (φάκελοι → υποφάκελοι → αρχεία) και
          μια τέταρτη, ξεχωριστή διαδρομή για την αναζήτηση που παρέκαμπτε τα
          φίλτρα. Τώρα υπάρχει ένα φιλτραρισμένο σύνολο, ομαδοποιημένο στον
          χρόνο, και οι όψεις από πάνω το στενεύουν. */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
          {[0, 1, 2, 3, 4, 5].map(i => <Skeleton key={i} h={120} r={12}/>)}
        </div>
      ) : items.length === 0 ? (
        <div className="card"><EmptyState icon={<FolderOpen size={20}/>} title="Κανένα έγγραφο ακόμη"
          hint="Από κάθε λογαριασμό, απόδειξη ή συμβόλαιο αναγνωρίζονται πάροχος, ΑΦΜ, ποσό, ημερομηνία και περίοδος — και το έγγραφο αρχειοθετείται στην κατηγορία του."
          action={showUpload ? undefined : <Btn variant="primary" onClick={() => setShowUpload(true)}>Καταχώριση πρώτου αρχείου</Btn>}/></div>
      ) : (
        <FileList items={visible} groups={groups} a={fileActions(true)}
          empty={<EmptyState icon={<SearchX size={20}/>}
            title="Δεν βρέθηκαν έγγραφα"
            hint={q ? `Καμία αντιστοιχία για «${query}». Η αναζήτηση καλύπτει πάροχο, ποσό και ΑΦΜ.`
                    : 'Ο συνδυασμός των ενεργών φίλτρων δεν αφήνει κανένα αρχείο.'}
            action={<Btn variant="secondary" onClick={() => { setSel(clearAll()); setQuery(''); }}>Καθαρισμός φίλτρων</Btn>}/>}/>
      )}

      {/* ── Lightbox (εικόνα ή προεπισκόπηση PDF) ───────────────────────── */}
      {lightbox && lightbox.url && (
        <div onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, background: T.scrim, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, flexDirection: 'column', gap: 12 }}>
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

      {/* ── Διόρθωση αναγνώρισης (ό,τι διάβασε λάθος η σάρωση) ───────────── */}
      {fixItems && fixItems.length > 0 && <FixModal items={fixItems} onCancel={() => setFixItems(null)} onSave={applyFix}/>}
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


/* ── Υποφάκελος (πάροχος ή έτος) ─────────────────────────────────────────── */


/* ── Λίστα αρχείων ───────────────────────────────────────────────────────── */
interface FileActions {
  view: 'grid' | 'list'; showFolder?: boolean; selected: Set<string>;
  onToggleSel: (id: string) => void; onOpenLightbox: (i: Item) => void;
  onDelete: (i: Item) => void; onRename: (i: Item) => void; onFix: (i: Item) => void;
}
const isPdfItem = (i: Item) => /pdf/i.test(i.raw?.mime || '') || /\.pdf($|\?)/i.test(i.url || '');
const canPreview = (i: Item) => !!i.url && (i.isImage || isPdfItem(i));

// Οι ομάδες ΔΕΝ υπολογίζονται εδώ. Έρχονται έτοιμες από το lib/archive/facets.ts,
// που είναι καθαρή λογική με τεστ — πριν, η ομαδοποίηση ανά μήνα ήταν γραμμένη
// και εδώ, με δικό της τρόπο ονομασίας. Δύο υλοποιήσεις του ίδιου πράγματος
// σημαίνει ότι μια διόρθωση σε μία δεν φτάνει ποτέ στην άλλη.
function FileList({ items, groups, empty, a }: { items: Item[]; groups?: TimeGroup<Item>[]; empty: React.ReactNode; a: FileActions }) {
  if (items.length === 0) return <div className="card">{empty}</div>;
  if (groups) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {groups.map(({ key: m, label, items: its }) => (
          <div key={m} className="card" style={{ margin: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-tertiary)' }}/>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.06em' }}>{label}</span>
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
    style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', background: T.scrim, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' }}>{children}</button>
);

function FileCard({ i, a }: { i: Item; a: FileActions }) {
  const [hov, setHov] = useState(false);
  // Σε οθόνη αφής δεν υπάρχει hover: οι ενέργειες μένουν μόνιμα ορατές, αλλιώς
  // η μετονομασία και η διαγραφή αρχείου είναι απλώς απρόσιτες.
  const coarse = useCoarsePointer();
  const shown = hov || coarse;
  const sel = a.selected.has(i.id);
  const preview = canPreview(i);
  const canFix = !!i.raw && i.raw.kind === 'document';
  const selectable = !!i.raw || !!i.url;   // τα «εικονικά» στοιχεία (π.χ. λογαριασμοί χωρίς αρχείο) δεν επιλέγονται
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ borderRadius: T.radius.inner, overflow: 'hidden', border: `1.5px solid ${sel ? 'var(--accent)' : 'var(--border-subtle)'}`, background: 'var(--bg-elevated)', boxShadow: sel ? '0 0 0 3px var(--accent-soft)' : 'none', transition: `border-color 0.14s ${T.ease.standard}, box-shadow 0.14s ${T.ease.standard}` }}>
      <div style={{ position: 'relative', aspectRatio: '4 / 3', background: 'var(--bg-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: preview ? 'pointer' : 'default' }}
        onClick={() => { if (preview) a.onOpenLightbox(i); }}>
        {i.isImage && i.url
          ? <img src={i.url} alt={i.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
          : <span style={{ color: 'var(--accent)' }}><svg {...S} width={30} height={30}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span>}
        {isPdfItem(i) && <span style={{ position: 'absolute', bottom: 6, left: 6, fontSize: 8, fontWeight: 800, letterSpacing: '0.05em', color: '#fff', background: T.scrim, padding: '2px 6px', borderRadius: 6 }}>PDF</span>}
        {selectable && (shown || sel) && <div style={{ position: 'absolute', top: 6, left: 6 }} onClick={e => e.stopPropagation()}><SelectBox checked={sel} onToggle={() => a.onToggleSel(i.id)}/></div>}
        {shown && i.raw && (
          <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 5 }}>
            <OverlayBtn title="Μετονομασία" onClick={e => { e.stopPropagation(); a.onRename(i); }}><IconPencil size={13}/></OverlayBtn>
            {canFix && <OverlayBtn title="Διόρθωση αναγνώρισης" onClick={e => { e.stopPropagation(); a.onFix(i); }}><IconMoveFolder size={13}/></OverlayBtn>}
            <OverlayBtn title="Διαγραφή" onClick={e => { e.stopPropagation(); a.onDelete(i); }}><IconX/></OverlayBtn>
          </div>
        )}
      </div>
      <div style={{ padding: '9px 11px' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
          <OriginTag i={i}/>
          {i.value != null && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-secondary)', fontFamily: T.font.mono }}>{fe(i.value)}</span>}
          <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: T.font.mono, marginLeft: 'auto' }}>{i.date ? fd(i.date) : ABSENT_DATE}</span>
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
  const coarse = useCoarsePointer();
  const shown = hov || coarse;
  const sel = a.selected.has(i.id);
  const canFix = !!i.raw && i.raw.kind === 'document';
  const selectable = !!i.raw || !!i.url;
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 12, background: sel ? 'var(--accent-soft)' : 'var(--bg-elevated)', border: `1px solid ${sel ? 'var(--accent-border)' : 'var(--border-subtle)'}`, borderRadius: T.radius.inner, padding: '10px 14px', transition: `background 0.14s ${T.ease.standard}` }}>
      <div style={{ width: 18, display: 'flex', flexShrink: 0 }}>{selectable && (shown || sel) && <SelectBox checked={sel} onToggle={() => a.onToggleSel(i.id)}/>}</div>
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
      {shown && i.raw && (
        <>
          <RowBtn title="Μετονομασία" onClick={() => a.onRename(i)}><IconPencil size={14}/></RowBtn>
          {canFix && <RowBtn title="Διόρθωση αναγνώρισης" onClick={() => a.onFix(i)}><IconMoveFolder size={14}/></RowBtn>}
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

/* ══════════════════════════════════════════════════════════════════════════
   ΚΑΡΤΑ ΕΠΙΒΕΒΑΙΩΣΗΣ ΕΝΟΣ ΑΡΧΕΙΟΥ
   Δείχνει τι διάβασε η σάρωση, ΣΗΜΑΙΝΕΙ τι δεν διάβασε, και αφήνει τον χρήστη να
   διορθώσει. Καμία ψεύτικη πρόοδος: στάδιο με λέξεις και σπίνερ, όχι ποσοστό που
   δεν μετρά τίποτα.
   ══════════════════════════════════════════════════════════════════════════ */

// Μικρός σπίνερ γραμμής (ίδια γλώσσα με το Spinner του Theme, χωρίς το padding του).
const RowSpinner = () => (
  <span style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid var(--border-subtle)', borderTopColor: 'var(--accent)', animation: 'spin 0.7s linear infinite', display: 'inline-block', flexShrink: 0 }}/>
);

const STAGE_TEXT: Record<DraftStatus, string> = {
  pending: 'Σε αναμονή', scanning: 'Ανάγνωση εγγράφου…', ready: '',
  failed: 'Δεν διαβάστηκε', saving: 'Καταχώριση…', saved: '', error: 'Δεν αποθηκεύτηκε',
};

const SCAN_ERROR_TEXT: Record<ScanError, string> = {
  big: `Πολύ μεγάλο αρχείο (όριο ${MAX_SCAN_MB}MB).`,
  service: 'Η υπηρεσία ανάγνωσης δεν απάντησε. Δοκίμασε ξανά σε λίγο.',
  unreadable: 'Δεν διάβασα καθαρά το έγγραφο. Τράβα τη φωτογραφία με καλό φως, ίσια, να χωράει όλο το χαρτί — ή ανέβασε το PDF του παρόχου.',
  key_missing: 'Η αυτόματη ανάγνωση δεν είναι ενεργή ακόμη σε αυτόν τον λογαριασμό.',
};

// Ποια πεδία δείχνει η κάρτα ανά τύπο. Τα πέντε του ταιριάσματος εμφανίζονται
// για ό,τι έχει ποσό (λογαριασμός, απόδειξη, φόρος, ασφαλιστήριο).
const hasMoney = (t?: string) => t === 'bill' || t === 'payment' || t === 'tax' || t === 'insurance';

function DraftCard({ d, onToggle, onPatch, onPatchDoc, onCommit, onRemove }: {
  d: Draft;
  onToggle: () => void;
  onPatch: (p: Partial<Draft>) => void;
  onPatchDoc: (p: Partial<ScannedDoc>) => void;
  onCommit: (choice?: string | null) => void;
  onRemove: () => void;
}) {
  const doc = d.doc;
  const v = doc ? validateDoc(doc) : { blocking: [], recommended: [], invalid: [] };
  const miss = (k: string) => v.blocking.includes(k) || v.recommended.includes(k)
    || (k === 'period_to' && v.recommended.includes('period_from'));
  const bad = (k: string) => v.invalid.includes(k) || (k === 'period_to' && v.invalid.includes('period_from'));
  const mark = (labelText: string, k: string) => `${labelText}${bad(k) ? ' • άκυρο' : miss(k) ? ' • λείπει' : ''}`;
  const amountKey: 'amount' | 'premium' = doc?.doc_type === 'insurance' ? 'premium' : 'amount';
  const busyRow = d.status === 'scanning' || d.status === 'saving' || d.status === 'pending';
  const folder = d.kind === 'photo' ? FOLDER_LABEL.photos : FOLDER_LABEL[folderForDoc(d.category)];

  return (
    <div style={{ border: `1px solid ${d.status === 'saved' ? 'var(--positive-border)' : d.status === 'failed' || d.status === 'error' ? 'var(--warning-border)' : 'var(--border-subtle)'}`, borderRadius: T.radius.inner, background: 'var(--bg-elevated)', padding: '10px 12px' }}>
      {/* Κεφαλίδα γραμμής */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {busyRow ? <RowSpinner/> : (
          <svg {...S} width={15} height={15} style={{ color: d.status === 'saved' ? 'var(--positive)' : 'var(--text-tertiary)', flexShrink: 0 }}>
            {d.kind === 'photo'
              ? <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5-4 4 3 3-2 4 3"/></>
              : <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>}
          </svg>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.file.name}</div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
            {STAGE_TEXT[d.status] || (d.kind === 'photo'
              ? `Φωτογραφία χώρου · ${d.category}`
              : `${DOC_TYPE_LABELS[doc?.doc_type || 'other']} · ${d.category} → ${folder}`)}
          </div>
        </div>
        {d.status === 'saved' && (d.saved || []).map(t => (
          <span key={t} style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--positive)', background: 'var(--positive-soft)', border: '1px solid var(--positive-border)', borderRadius: T.radius.pill, padding: '2px 8px', whiteSpace: 'nowrap' }}>{t}</span>
        ))}
        {d.status === 'ready' && (v.blocking.length > 0 || v.invalid.length > 0) && (
          <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--warning)', background: 'var(--warning-soft)', border: '1px solid var(--warning-border)', borderRadius: T.radius.pill, padding: '2px 8px', whiteSpace: 'nowrap' }}>
            {v.blocking.length ? 'Χρειάζεται συμπλήρωση' : 'Έλεγξε τα στοιχεία'}
          </span>
        )}
        {d.status === 'ready' && (
          <button onClick={onToggle} style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: T.radius.badge, color: 'var(--text-secondary)', fontSize: 10.5, fontWeight: 600, padding: '4px 9px', cursor: 'pointer', fontFamily: T.font.sans, whiteSpace: 'nowrap' }}>
            {d.open ? 'Σύμπτυξη' : 'Διόρθωση'}
          </button>
        )}
        {(d.status === 'ready' || d.status === 'failed' || d.status === 'error') && (
          <button onClick={onRemove} title="Αφαίρεση από τη λίστα" style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', padding: 2 }}><IconX/></button>
        )}
      </div>

      {/* Δεν διαβάστηκε: λέμε γιατί και τι να κάνει. */}
      {d.status === 'failed' && d.scanError && (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: 8 }}>{SCAN_ERROR_TEXT[d.scanError]}</div>
      )}
      {d.status === 'error' && d.errorText && (
        <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 8 }}>{d.errorText}</div>
      )}

      {/* Ερώτηση συμφωνίας — πριν γραφτεί οτιδήποτε. */}
      {d.ask && (
        <div style={{ marginTop: 10, background: 'var(--bg-base)', border: '1px solid var(--accent-border)', borderRadius: T.radius.inner, padding: '10px 12px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>{d.ask.question}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {d.ask.options.map(o => (
              <button key={o.id} onClick={() => onCommit(o.id)}
                style={{ textAlign: 'left', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: T.radius.badge, padding: '8px 11px', cursor: 'pointer', fontFamily: T.font.sans }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-primary)' }}>{o.label}</div>
                {o.reasons.length > 0 && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>{o.reasons.join(' · ')}</div>}
              </button>
            ))}
            <button onClick={() => onCommit(null)}
              style={{ textAlign: 'left', background: 'transparent', border: '1px dashed var(--border-default)', borderRadius: T.radius.badge, padding: '8px 11px', cursor: 'pointer', fontFamily: T.font.sans }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)' }}>Κανέναν — νέα, ξεχωριστή εγγραφή</div>
            </button>
          </div>
        </div>
      )}

      {/* Τα πεδία, προσυμπληρωμένα. */}
      {d.status === 'ready' && d.open && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {d.kind === 'photo' ? (
            <div style={g2x}>
              <CustomSelect label="Κατηγορία φωτογραφίας" value={d.category} onChange={c => onPatch({ category: c })}
                options={PHOTO_CATEGORIES.map(c => ({ value: c, label: c }))}/>
              <TextInput label="Τι δείχνει" value={d.photoTitle || ''} onChange={t => onPatch({ photoTitle: t })} placeholder="Παράδειγμα: Σαλόνι, βόρειος τοίχος"/>
            </div>
          ) : doc ? (<>
            {(v.blocking.length > 0 || v.invalid.length > 0 || v.recommended.length > 0) && (
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {v.blocking.length > 0 && <>Χρειάζεται: <strong>{v.blocking.map(f => DOC_FIELD_LABELS[f] || f).join(', ')}</strong>. </>}
                {v.invalid.length > 0 && <>Δεν είναι έγκυρο: <strong>{v.invalid.map(f => DOC_FIELD_LABELS[f] || f).join(', ')}</strong>. </>}
                {v.recommended.length > 0 && <>Δεν διάβασα: <strong>{v.recommended.map(f => DOC_FIELD_LABELS[f] || f).join(', ')}</strong>.</>}
              </div>
            )}
            <div style={g2x}>
              <CustomSelect label="Κατηγορία (φάκελος)" value={d.category} onChange={c => onPatch({ category: c })}
                options={DOC_CATEGORIES.map(c => ({ value: c, label: `${c}  →  ${FOLDER_LABEL[folderForDoc(c)]}` }))}/>
              <TextInput label="Τίτλος" value={doc.title || ''} onChange={t => onPatchDoc({ title: t })} placeholder="Σύντομη περιγραφή"/>
            </div>
            <div style={g2x}>
              <TextInput label={mark('Πάροχος ή εκδότης', 'provider')} value={doc.provider || ''} onChange={t => onPatchDoc({ provider: t })} placeholder="Όπως γράφεται στο χαρτί"/>
              {hasMoney(doc.doc_type) && (
                <TextInput label={mark('ΑΦΜ παρόχου', 'provider_afm')} value={doc.provider_afm || ''} onChange={t => onPatchDoc({ provider_afm: t.replace(/\D/g, '') })} placeholder="9 ψηφία"/>
              )}
            </div>
            {hasMoney(doc.doc_type) && (
              <div style={g2x}>
                <NumberInput label={mark('Ποσό (€)', amountKey)} value={doc[amountKey] != null ? String(doc[amountKey]) : ''}
                  onChange={t => onPatchDoc({ [amountKey]: t.trim() ? parseFloat(t.replace(',', '.')) || undefined : undefined } as Partial<ScannedDoc>)} placeholder="0,00"/>
                <DatePicker label={mark('Ημερομηνία έκδοσης', 'issue_date')} value={doc.issue_date || ''} onChange={t => onPatchDoc({ issue_date: t })}/>
              </div>
            )}
            {(doc.doc_type === 'bill' || doc.doc_type === 'tax') && (
              <div style={g2x}>
                <DatePicker label={mark('Ημερομηνία λήξης πληρωμής', 'due_date')} value={doc.due_date || ''} onChange={t => onPatchDoc({ due_date: t })}/>
              </div>
            )}
            {hasMoney(doc.doc_type) && (
              <>
                <div style={g2x}>
                  <DatePicker label={mark('Περίοδος από', 'period_from')} value={doc.period_from || ''} onChange={t => onPatchDoc({ period_from: t, period: undefined })}/>
                  <DatePicker label={mark('Περίοδος έως', 'period_to')} value={doc.period_to || ''} onChange={t => onPatchDoc({ period_to: t, period: undefined })}/>
                </div>
                {doc.period && <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>Στο χαρτί: {doc.period}</div>}
              </>
            )}
            {!hasMoney(doc.doc_type) && (
              <div style={g2x}>
                <DatePicker label="Ημερομηνία" value={doc.issue_date || ''} onChange={t => onPatchDoc({ issue_date: t })}/>
              </div>
            )}
            <Textarea label="Σημειώσεις" value={doc.notes || ''} onChange={t => onPatchDoc({ notes: t })} placeholder="Προαιρετικά"/>
          </>) : null}
        </div>
      )}
    </div>
  );
}

/* ── Modals (μετονομασία / διόρθωση αναγνώρισης) ─────────────────────────── */
function ModalShell({ title, sub, children, onCancel, onConfirm, confirmLabel, confirmDisabled }: {
  title: string; sub?: string; children: React.ReactNode; onCancel: () => void; onConfirm: () => void; confirmLabel: string; confirmDisabled?: boolean;
}) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Στοιχεία εγγράφου" onClick={onCancel} style={{ position: 'fixed', inset: 0, background: T.scrim, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
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

/**
 * ΔΙΟΡΘΩΣΗ ΑΝΑΓΝΩΡΙΣΗΣ — αντικαθιστά το παλιό «Μετακίνηση σε φάκελο».
 * Ο φάκελος δεν είναι πια χειροκίνητη επιλογή αλλά ΑΠΟΤΕΛΕΣΜΑ της αναγνώρισης:
 * αν θέλει να αλλάξει, αυτό που διορθώνεται είναι τι διάβασε η σάρωση. Γι' αυτό
 * εδώ διορθώνονται και τα πεδία που κάνουν τον έλεγχο «πληρώθηκε» να δουλεύει:
 * πάροχος, ΑΦΜ, ποσό, ημ. έκδοσης, περίοδος από–έως. Σε πολλαπλή επιλογή αλλάζει
 * μόνο το ράφι — δεν βάζουμε το ίδιο ποσό σε δέκα διαφορετικά χαρτιά.
 */
function FixModal({ items, onCancel, onSave }: { items: Item[]; onCancel: () => void; onSave: (p: Record<string, unknown>) => void }) {
  const one = items.length === 1 ? items[0].raw : null;
  const [cat, setCat] = useState(one?.category && DOC_CATEGORIES.includes(one.category) ? one.category : DOC_CATEGORIES[0]);
  const [supplier, setSupplier] = useState(one?.supplier || '');
  const [afm, setAfm] = useState(one?.provider_afm || '');
  const [amount, setAmount] = useState(one?.amount != null ? String(numOrNull(one.amount) ?? '') : '');
  const [issue, setIssue] = useState(one?.issue_date || '');
  const [from, setFrom] = useState(one?.period_from || '');
  const [to, setTo] = useState(one?.period_to || '');
  const afmDigitsOnly = afm.replace(/\D/g, '');
  const afmBad = afmDigitsOnly.length > 0 && !isValidAfm(afmDigitsOnly);

  const submit = () => {
    if (!one) { onSave({ category: cat }); return; }
    onSave({
      category: cat,
      supplier: supplier.trim() || null,
      provider_afm: afmDigitsOnly || null,
      amount: amount.trim() ? numOrNull(amount.trim()) : null,
      issue_date: issue || null,
      period_from: from || null,
      period_to: to || null,
    });
  };

  return (
    <ModalShell title={items.length > 1 ? `Διόρθωση ${items.length} αρχείων` : 'Διόρθωση αναγνώρισης'}
      sub={items.length > 1
        ? 'Σε πολλά αρχεία μαζί αλλάζει μόνο η κατηγορία — ο φάκελος ενημερώνεται αυτόματα.'
        : 'Διόρθωσε ό,τι διάβασε λάθος η σάρωση. Ο φάκελος προκύπτει από την κατηγορία.'}
      onCancel={onCancel} onConfirm={submit} confirmLabel="Αποθήκευση" confirmDisabled={afmBad}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <CustomSelect label="Κατηγορία" value={cat} onChange={setCat}
          options={DOC_CATEGORIES.map(c => ({ value: c, label: `${c}  →  ${FOLDER_LABEL[folderForDoc(c)]}` }))}/>
        {one && (<>
          <div style={g2x}>
            <TextInput label="Πάροχος ή εκδότης" value={supplier} onChange={setSupplier} placeholder="Όπως γράφεται στο παραστατικό"/>
            <TextInput label="ΑΦΜ παρόχου" value={afm} onChange={setAfm} placeholder="9 ψηφία"/>
          </div>
          {afmBad && <div style={{ fontSize: 11, color: 'var(--negative)', fontFamily: T.font.sans }}>Το ΑΦΜ δεν περνά τον έλεγχο της ΑΑΔΕ. Διόρθωσέ το ή άφησέ το κενό.</div>}
          <div style={g2x}>
            <NumberInput label="Ποσό" suffix="€" value={amount} onChange={setAmount} placeholder="0,00"/>
            <DatePicker label="Ημερομηνία έκδοσης" value={issue} onChange={setIssue}/>
          </div>
          <div style={g2x}>
            <DatePicker label="Περίοδος από" value={from} onChange={setFrom}/>
            <DatePicker label="Περίοδος έως" value={to} onChange={setTo}/>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.5, fontFamily: T.font.sans }}>
            Ο πάροχος, το ΑΦΜ, το ποσό, η ημερομηνία και η περίοδος είναι τα πέντε πεδία
            με τα οποία το app διαπιστώνει ότι ένας λογαριασμός πληρώθηκε.
          </div>
        </>)}
      </div>
    </ModalShell>
  );
}

const g2x: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 12 };
