'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, fd, KPIGrid, Spinner } from '@/components/Theme';
import { CustomSelect, TextInput, DatePicker, Textarea } from './UIComponents';
import { useAppPreferences } from './useAppPreferences';

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
  'Λογαριασμός Ρεύματος', 'Λογαριασμός Φυσικού Αερίου', 'Λογαριασμός Νερού',
  'Τηλέφωνο / Internet', 'Ασφαλιστήριο Συμβόλαιο', 'Απεντόμωση / Μυοκτονία',
  'Τιμολόγιο Καθαρισμού', 'Συντήρηση Πισίνας', 'Συντήρηση Ανελκυστήρα',
  'Εταιρεία Ασφαλείας', 'Κοινόχρηστα', 'Μισθωτήριο / Συμβόλαιο',
  'ΕΝΦΙΑ / Φορολογικά', 'Τεχνική Έκθεση', 'Άλλο Έγγραφο',
];

// Συνήθεις πάροχοι, προτάσεις (ελεύθερη πληκτρολόγηση για οποιονδήποτε άλλο)
const COMMON_SUPPLIERS = [
  'ΔΕΗ', 'Protergia', 'ΗΡΩΝ', 'NRG', 'Elin', 'Volton', 'enerwave', 'Zenith',
  'Φυσικό Αέριο Ελλάδος', 'ΕΥΔΑΠ', 'ΕΥΑΘ', 'ΔΕΥΑ',
  'COSMOTE', 'Vodafone', 'Nova', 'Wind',
  'Hellas Direct', 'Interamerican', 'Anytime', 'Magenta Insurance', 'Ergo', 'Allianz',
  'Διαχείριση Πολυκατοικίας', 'Συνεργείο Καθαρισμού', 'Συντήρηση Ανελκυστήρα', 'Εταιρεία Ασφαλείας',
];

const fmtSize = (b: number | null) => {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
};

const isImage = (r: DocRow) => (r.mime || '').startsWith('image/');

const card: React.CSSProperties = {
  background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
  borderRadius: T.radius.card, padding: 20, marginBottom: 16,
};
const inputStyle: React.CSSProperties = {
  width: '100%', height: 40, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
  borderRadius: T.radius.inner, padding: '0 14px', color: 'var(--text-primary)', fontSize: 13,
  fontFamily: T.font.sans, outline: 'none', boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' as const,
  color: 'var(--text-secondary)', marginBottom: 6, fontFamily: T.font.sans,
};

function SecHead({ label, sub, right }: { label: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', fontFamily: T.font.sans }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2, fontFamily: T.font.sans }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

export default function TabDocuments({ propertyId, userId, embedded }: Props & { embedded?: boolean }) {
  const supabase = createClient();
  const { prefs } = useAppPreferences(propertyId);
  const [tab, setTab] = useState<'photo' | 'document'>('photo');
  const [rows, setRows] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [form, setForm] = useState({ category: PHOTO_CATEGORIES[0], supplier: '', title: '', doc_date: '', notes: '' });
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterSupplier, setFilterSupplier] = useState('all');
  const [groupBy, setGroupBy] = useState<'category' | 'supplier'>('category');
  const [lightbox, setLightbox] = useState<DocRow | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchDocs = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    const { data } = await supabase.from('property_documents').select('*')
      .eq('property_id', propertyId).order('created_at', { ascending: false });
    const list = (data ?? []) as DocRow[];
    const paths = list.map(r => r.file_path);
    if (paths.length) {
      const { data: signed } = await supabase.storage.from('property-files').createSignedUrls(paths, 60 * 60 * 24);
      if (signed) list.forEach((r, i) => { r.signedUrl = signed[i]?.signedUrl ?? undefined; });
    }
    setRows(list);
    setLoading(false);
  }, [propertyId]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);
  useEffect(() => {
    setForm(f => ({ ...f, category: (tab === 'photo' ? PHOTO_CATEGORIES : DOC_CATEGORIES)[0] }));
    setFilterCategory('all'); setFilterSupplier('all');
  }, [tab]);

  const onFile = async (file: File) => {
    if (!file || !propertyId) return;
    setUploading(true); setMsg(null);
    const safe = file.name.replace(/[^\w.\-]+/g, '_');
    const path = `${userId}/${propertyId}/${tab}/${Date.now()}_${safe}`;
    const { error: upErr } = await supabase.storage.from('property-files').upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (upErr) { setMsg({ text: `Σφάλμα ανεβάσματος: ${upErr.message}`, error: true }); setUploading(false); return; }
    const base = {
      property_id: propertyId, user_id: userId, kind: tab, category: form.category,
      title: form.title.trim() || file.name, notes: form.notes.trim() || null,
      doc_date: form.doc_date || null, file_path: path, file_name: file.name,
      mime: file.type || null, size_bytes: file.size,
    };
    let { error: insErr } = await supabase.from('property_documents').insert({ ...base, supplier: form.supplier.trim() || null });
    // Ανθεκτικότητα: αν δεν έχει εφαρμοστεί ακόμη το migration για τη στήλη supplier, ξανακαταχώρησε χωρίς αυτήν
    if (insErr && /supplier/i.test(insErr.message)) {
      ({ error: insErr } = await supabase.from('property_documents').insert(base));
    }
    if (insErr) { setMsg({ text: `Σφάλμα καταχώρησης: ${insErr.message}`, error: true }); setUploading(false); return; }
    setForm(f => ({ ...f, title: '', notes: '', doc_date: '' }));
    setUploading(false); setMsg({ text: tab === 'photo' ? 'Η φωτογραφία προστέθηκε' : 'Το αρχείο προστέθηκε' });
    setTimeout(() => setMsg(null), 3500);
    fetchDocs();
  };

  const del = async (r: DocRow) => {
    if (prefs.confirmBeforeDelete && !window.confirm('Να διαγραφεί οριστικά αυτό το αρχείο;')) return;
    await supabase.storage.from('property-files').remove([r.file_path]);
    await supabase.from('property_documents').delete().eq('id', r.id);
    if (lightbox?.id === r.id) setLightbox(null);
    fetchDocs();
  };

  const categories = tab === 'photo' ? PHOTO_CATEGORIES : DOC_CATEGORIES;
  const ofKind = rows.filter(r => r.kind === tab);
  const suppliersPresent = Array.from(new Set(ofKind.map(r => r.supplier).filter(Boolean))) as string[];
  const categoriesPresent = Array.from(new Set(ofKind.map(r => r.category).filter(Boolean))) as string[];

  const visible = ofKind.filter(r =>
    (filterCategory === 'all' || r.category === filterCategory) &&
    (filterSupplier === 'all' || r.supplier === filterSupplier));

  const photoCount = rows.filter(r => r.kind === 'photo').length;
  const docCount   = rows.filter(r => r.kind === 'document').length;
  const totalSize  = rows.reduce((s, r) => s + (r.size_bytes || 0), 0);
  const supplierCount = new Set(rows.map(r => r.supplier).filter(Boolean)).size;

  // Ομαδοποίηση εγγράφων ανά κατηγορία ή ανά πάροχο
  const grouped: Record<string, DocRow[]> = {};
  visible.forEach(r => {
    const k = (groupBy === 'category' ? r.category : r.supplier) || (groupBy === 'category' ? 'Άλλο' : 'Χωρίς πάροχο');
    (grouped[k] ??= []).push(r);
  });

  const segBtn = (key: 'photo' | 'document'): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: T.radius.btn,
    border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: tab === key ? 700 : 500,
    fontFamily: T.font.sans, background: tab === key ? 'var(--accent)' : 'transparent',
    color: tab === key ? 'var(--accent-text)' : 'var(--text-secondary)', transition: 'all 0.15s',
  });

  const SupplierChip = ({ s }: { s: string | null }) => s ? (
    <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-secondary)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.badge, padding: '1px 7px', fontFamily: T.font.sans, whiteSpace: 'nowrap' as const }}>{s}</span>
  ) : null;

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>
      {/* Header + segmented control */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' as const }}>
        {!embedded && <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)', margin: 0, lineHeight: 1.15 }}>Φωτογραφίες & Αρχείο</h1>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
            Τεκμηρίωση κατάστασης ακινήτου και αρχείο λογαριασμών, συμβολαίων και τιμολογίων ανά πάροχο και κατηγορία
          </div>
        </div>}
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 4 }}>
          <button onClick={() => setTab('photo')} style={segBtn('photo')}>
            Φωτογραφίες <span style={{ fontSize: 10, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', opacity: 0.8 }}>{photoCount}</span>
          </button>
          <button onClick={() => setTab('document')} style={segBtn('document')}>
            Έγγραφα <span style={{ fontSize: 10, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', opacity: 0.8 }}>{docCount}</span>
          </button>
        </div>
      </div>

      {/* Σύνοψη αρχείου */}
      <KPIGrid items={[
        { label: 'Φωτογραφίες',      value: String(photoCount) },
        { label: 'Έγγραφα',          value: String(docCount) },
        { label: 'Πάροχοι',          value: String(supplierCount) },
        { label: 'Συνολικός Χώρος',  value: totalSize > 0 ? fmtSize(totalSize) : '0 B' },
      ]}/>

      {/* Upload card */}
      <div style={card}>
        <SecHead label={tab === 'photo' ? 'Νέα Φωτογραφία' : 'Νέο Αρχείο'}
          sub={tab === 'photo'
            ? 'Ανέβασε φωτογραφίες ως απόδειξη κατάστασης, για ενοικίαση, πώληση ή τον ασφαλιστή'
            : 'Ανέβασε οποιοδήποτε αρχείο (PDF, εικόνα, Word, Excel…) και ταξινόμησέ το ανά πάροχο και κατηγορία'}/>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 14, marginBottom: 14 }}>
          <CustomSelect label="Κατηγορία" value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))}
            options={categories.map(c => ({ value: c, label: c }))}/>
          <div>
            <label style={labelStyle}>Προμηθευτής / Πάροχος</label>
            <input list="supplier-suggestions" value={form.supplier}
              onChange={e => { const v = e.target.value; setForm(f => {
                const next = { ...f, supplier: v };
                if (prefs.autoSuggestCategory && tab === 'document') { const c = suggestCategory(v); if (c && categories.includes(c)) next.category = c; }
                return next;
              }); }}
              placeholder="για παράδειγμα ΔΕΗ, ΕΥΔΑΠ, COSMOTE, Hellas Direct…" style={inputStyle}/>
            <datalist id="supplier-suggestions">
              {COMMON_SUPPLIERS.map(s => <option key={s} value={s}/>)}
            </datalist>
          </div>
          <DatePicker label="Ημερομηνία" value={form.doc_date} onChange={v => setForm(f => ({ ...f, doc_date: v }))}/>
        </div>
        <div style={{ marginBottom: 14 }}>
          <TextInput label="Τίτλος / Περιγραφή" value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))}
            placeholder={tab === 'photo' ? 'για παράδειγμα Σαλόνι, βόρειος τοίχος' : 'για παράδειγμα ΔΕΗ Ιανουάριος 2026'}/>
        </div>
        <div style={{ marginBottom: 14 }}>
          <Textarea label="Σημειώσεις" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))}
            placeholder="Προαιρετικές σημειώσεις (για παράδειγμα εκκρεμεί πληρωμή, φθορά στο πάτωμα…)"/>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' as const }}>
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: T.radius.btn, padding: '10px 20px', fontSize: 12, fontWeight: 700, fontFamily: T.font.sans, cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.6 : 1 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            {uploading ? 'Ανέβασμα…' : tab === 'photo' ? 'Ανέβασμα Φωτογραφίας' : 'Ανέβασμα Αρχείου'}
          </button>
          <input ref={fileRef} type="file"
            accept={tab === 'photo' ? 'image/png,image/jpeg,image/webp,image/heic,image/*' : undefined}
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }}/>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
            {tab === 'photo' ? 'PNG, JPEG, WebP…' : 'Οποιοσδήποτε τύπος αρχείου, PDF, PNG, JPEG, Word, Excel…'}
          </span>
          {msg && (
            <span style={{ fontSize: 11, fontWeight: 600, color: msg.error ? 'var(--negative)' : 'var(--positive)', fontFamily: T.font.sans }}>{msg.text}</span>
          )}
        </div>
      </div>

      {/* Filters */}
      {ofKind.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' as const, alignItems: 'flex-end' }}>
          <div style={{ minWidth: 200 }}>
            <CustomSelect label="Φίλτρο κατηγορίας" value={filterCategory} onChange={setFilterCategory}
              options={[{ value: 'all', label: 'Όλες οι κατηγορίες' }, ...categoriesPresent.map(c => ({ value: c, label: c }))]}/>
          </div>
          <div style={{ minWidth: 200 }}>
            <CustomSelect label="Φίλτρο παρόχου" value={filterSupplier} onChange={setFilterSupplier}
              options={[{ value: 'all', label: 'Όλοι οι πάροχοι' }, ...suppliersPresent.map(s => ({ value: s, label: s }))]}/>
          </div>
          {tab === 'document' && (
            <div style={{ display: 'flex', gap: 4, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.btn, padding: 3, marginLeft: 'auto' }}>
              {([['category', 'Ανά Κατηγορία'], ['supplier', 'Ανά Πάροχο']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setGroupBy(k)}
                  style={{ fontSize: 10, fontWeight: groupBy === k ? 700 : 500, padding: '6px 12px', borderRadius: T.radius.badge, border: 'none', cursor: 'pointer', fontFamily: T.font.sans, background: groupBy === k ? 'var(--accent)' : 'transparent', color: groupBy === k ? 'var(--accent-text)' : 'var(--text-secondary)' }}>{l}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <Spinner label="Φόρτωση…" />
      ) : visible.length === 0 ? (
        <div style={card}>
          <div style={{ textAlign: 'center' as const, padding: '40px 20px', color: 'var(--text-tertiary)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
              {ofKind.length === 0 ? (tab === 'photo' ? 'Δεν υπάρχουν φωτογραφίες ακόμη' : 'Δεν υπάρχουν αρχεία ακόμη') : 'Κανένα αποτέλεσμα με αυτά τα φίλτρα'}
            </div>
            <div style={{ fontSize: 11, lineHeight: 1.6, maxWidth: 420, margin: '0 auto' }}>
              {ofKind.length === 0
                ? (tab === 'photo'
                    ? 'Ανέβασε φωτογραφίες της κατάστασης του ακινήτου για αποδεικτικό υλικό πριν από ενοικίαση ή πώληση.'
                    : 'Ανέβασε τον πρώτο λογαριασμό, τιμολόγιο ή συμβόλαιο για να ξεκινήσει το ψηφιακό αρχείο του ακινήτου.')
                : 'Δοκίμασε να καθαρίσεις τα φίλτρα κατηγορίας ή παρόχου.'}
            </div>
          </div>
        </div>
      ) : tab === 'photo' ? (
        <div style={card}>
          <SecHead label="Φωτογραφικό Αρχείο" sub={`${visible.length} φωτογραφίες`}/>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {visible.map(r => (
              <div key={r.id} style={{ borderRadius: T.radius.inner, overflow: 'hidden', border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}>
                <div style={{ position: 'relative', aspectRatio: '4 / 3', background: 'var(--bg-overlay)', cursor: 'pointer' }} onClick={() => setLightbox(r)}>
                  {r.signedUrl && <img src={r.signedUrl} alt={r.title || ''} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/>}
                  <button onClick={e => { e.stopPropagation(); del(r); }} title="Διαγραφή"
                    style={{ position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>✕</button>
                </div>
                <div style={{ padding: '8px 10px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title || r.file_name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' as const }}>
                    <span style={{ fontSize: 9, color: 'var(--accent)', fontWeight: 600 }}>{r.category}</span>
                    <SupplierChip s={r.supplier}/>
                    <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: T.font.mono, marginLeft: 'auto' }}>{r.doc_date ? fd(r.doc_date) : fd(r.created_at)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        Object.entries(grouped).map(([grp, items]) => (
          <div key={grp} style={card}>
            <SecHead label={grp} sub={`${items.length} ${items.length === 1 ? 'αρχείο' : 'αρχεία'}`}/>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '10px 14px' }}>
                  {isImage(r) && r.signedUrl ? (
                    <img src={r.signedUrl} alt="" onClick={() => setLightbox(r)} style={{ width: 40, height: 40, borderRadius: T.radius.badge, objectFit: 'cover', flexShrink: 0, cursor: 'pointer', border: '1px solid var(--border-subtle)' }}/>
                  ) : (
                    <div style={{ width: 40, height: 40, borderRadius: T.radius.badge, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--accent)' }}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 320 }}>{r.title || r.file_name}</span>
                      <SupplierChip s={r.supplier}/>
                      {groupBy === 'supplier' && r.category && <span style={{ fontSize: 9, color: 'var(--accent)', fontWeight: 600 }}>{r.category}</span>}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2, fontFamily: T.font.sans }}>
                      {(r.doc_date ? fd(r.doc_date) : fd(r.created_at))}{r.size_bytes ? ` · ${fmtSize(r.size_bytes)}` : ''}{r.notes ? ` · ${r.notes}` : ''}
                    </div>
                  </div>
                  <a href={r.signedUrl} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none', padding: '6px 12px', border: '1px solid var(--accent-border)', borderRadius: T.radius.badge, whiteSpace: 'nowrap' as const }}>
                    Άνοιγμα
                  </a>
                  <button onClick={() => del(r)} title="Διαγραφή"
                    style={{ width: 28, height: 28, borderRadius: T.radius.badge, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 13, flexShrink: 0 }}>✕</button>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, flexDirection: 'column', gap: 12 }}>
          {lightbox.signedUrl && <img src={lightbox.signedUrl} alt={lightbox.title || ''} style={{ maxWidth: '92%', maxHeight: '82%', objectFit: 'contain', borderRadius: T.radius.inner }}/>}
          <div style={{ color: '#fff', fontSize: 12, fontFamily: T.font.sans, textAlign: 'center' as const }}>
            <div style={{ fontWeight: 700 }}>{lightbox.title || lightbox.file_name}</div>
            <div style={{ opacity: 0.7, marginTop: 2 }}>{[lightbox.category, lightbox.supplier, lightbox.doc_date ? fd(lightbox.doc_date) : fd(lightbox.created_at)].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
      )}
    </div>
  );
}
