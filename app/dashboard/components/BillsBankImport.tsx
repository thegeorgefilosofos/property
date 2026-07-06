'use client';

import { useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, fe } from '@/components/Theme';

const mdLabel: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 500, letterSpacing: '0.5px',
  textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 6, fontFamily: T.font.sans,
};

interface ParsedTransaction {
  id:          string;
  date:        string;
  description: string;
  amount:      number;
  debit:       boolean;
  category:    string;
  confidence:  'high' | 'medium' | 'low';
  selected:    boolean;
  matched:     string;
}

// ── Comprehensive Greek bank/merchant matcher ─────────────────────────────────
const MATCHERS = [
  { keywords: ['ΔΕΗ','DEH','ΔΗΜΟΣΙΑ ΕΠΙΧΕΙΡΗΣΗ ΗΛΕΚΤΡΙΣΜΟΥ','ΗΡΩΝ ΗΛΕΚΤΡΙΣΜΟΣ','HERON ENERGY','PROTERGIA','VOLTERRA','NRG BILLING','ZENITH ENERGY','ELIN ENERGY','WATT+VOLT','SKY ENERGY'], category: 'electricity', label: 'Ρεύμα', confidence: 'high' as const },
  { keywords: ['ΕΥΔΑΠ','EYDAP','ΕΥΑΘ','EYATH','ΔΕΥΑ','ΕΤΑΙΡΕΙΑ ΥΔΡΕΥΣΗΣ','ΥΔΡΕΥΣΗ'], category: 'water', label: 'Νερό', confidence: 'high' as const },
  { keywords: ['COSMOTE','OTE AE','NOVA BROADBAND','NOVA SA','FORTHNET','VODAFONE ΕΛΛΑΔΟΣ','WIND HELLAS','HOL SA','CYTA HELLAS','INALAN','ENTERWAVE','WIND MOBILE'], category: 'internet', label: 'Internet & Τηλεφωνία', confidence: 'high' as const },
  { keywords: ['NETFLIX','DISNEY PLUS','SPOTIFY AB','AMAZON PRIME','AMAZON DIGITAL','MAX HBO','YOUTUBE PREMIUM','GOOGLE YOUTUBE','ANT1 PLUS','COSMOTE TV','APPLE TV+','APPLE.COM/BILL'], category: 'streaming', label: 'Streaming & Συνδρομές', confidence: 'high' as const },
  { keywords: ['ICLOUD','APPLE ICLOUD','GOOGLE ONE','GOOGLE STORAGE','MICROSOFT 365','MICROSOFT ONLINE','DROPBOX','ADOBE SYSTEMS','CANVA'], category: 'streaming', label: 'Cloud & Λογισμικό', confidence: 'high' as const },
  { keywords: ['ΑΑΔΕ','AADE','ENFIA','ΕΝΦΙΑ','ΕΦΟΡΙΑ ΑΘΗΝΩΝ','ΔΗΜΟΣΙΑ ΕΣΟΔΑ','ΕΦΚΑ','ΙΚΑ','ΤΕΒΕ'], category: 'taxes', label: 'ΕΝΦΙΑ & Φόροι', confidence: 'high' as const },
  { keywords: ['ΔΗΜΟΣ ΑΘΗΝΑΙΩΝ','ΔΗΜΟΤΙΚΑ ΤΕΛΗ','ΔΗΜΟΤΙΚΗ','ΔΗΜΟΣ ΘΕΣΣΑΛΟΝΙΚΗΣ','ΔΗΜΟΤΙΚΗ ΑΡΧΗ','ΔΗΜΟΣ'], category: 'municipal', label: 'Δημοτικά Τέλη', confidence: 'medium' as const },
  { keywords: ['EDA ATTIKIS','ΕΔΑ ΑΤΤΙΚΗΣ','EDA THESS','DEPA','ΦΥΣΙΚΟ ΑΕΡΙΟ','GAS DISTRIBUTION','HERON GAS','PROTERGIA GAS'], category: 'gas', label: 'Φυσικό Αέριο', confidence: 'high' as const },
  { keywords: ['HELLAS DIRECT','INTERAMERICAN','EUROLIFE FFH','EUROLIFE','GENERALI HELLAS','AXA ASFALISTIKI','ΕΘΝΙΚΗ ΑΣΦΑΛΙΣΤΙΚΗ','ALLIANZ HELLAS','ERGO ΑΣΦΑΛΙΣΤΙΚΗ','GROUPAMA'], category: 'insurance', label: 'Ασφάλεια', confidence: 'high' as const },
  { keywords: ['ELTRAK SECURITY','G4S HELLAS','VANINFO','DSP SECURITY','SECURITAS','ΕΤΑΙΡΕΙΑ ΑΣΦΑΛΕΙΑΣ','ALARM'], category: 'security', label: 'Ασφάλεια & Security', confidence: 'medium' as const },
  { keywords: ['ΚΟΙΝΟΧΡΗΣΤΑ','ΚΤΗΡΙΟ','ΔΙΑΧΕΙΡΙΣΗΣ','ΚΤΗΡΙΟ','MYBILLYS','MY CONDO','COMFY'], category: 'common', label: 'Κοινόχρηστα', confidence: 'medium' as const },
  { keywords: ['ΑΝΕΛΚΥΣΤΗΡ','ΑΣΑΝΣΕΡ','KLEEMANN','OTIS','KONE','SCHINDLER','ELEVATOR','THYSSENKRUPP'], category: 'elevator', label: 'Συντήρηση Ασανσέρ', confidence: 'medium' as const },
  { keywords: ['ΠΙΣΙΝΑ','POOL','ΣΥΝΤΗΡΗΣΗ ΠΙΣΙΝΑΣ','ΧΛΩΡΙΟ'], category: 'pool', label: 'Καθαρισμός Πισίνας', confidence: 'medium' as const },
  { keywords: ['ΚΗΠΟΥΡ','ΚΗΠΟΣ','GARDEN','ΠΡΑΣΙΝΟ','LANDSCAP','ΦΥΤΑ'], category: 'gardener', label: 'Κηπουρός', confidence: 'medium' as const },
  { keywords: ['ΚΑΘΑΡΙΟΤΗΤ','ΚΑΘΑΡΙΣΜ','CLEANING','ΣΥΝΕΡΓΕΙΟ ΚΑΘΑΡΙΣΜΟΥ'], category: 'cleaner', label: 'Καθαριότητα', confidence: 'medium' as const },
  { keywords: ['ΥΔΡΑΥΛΙΚ','PLUMBER','ΑΠΟΦΡΑΞ'], category: 'plumber', label: 'Υδραυλικός', confidence: 'medium' as const },
  { keywords: ['ΗΛΕΚΤΡΟΛΟΓ','ELECTRICIAN'], category: 'electrician', label: 'Ηλεκτρολόγος', confidence: 'medium' as const },
  { keywords: ['ΣΥΝΤΗΡΗΣΗ','ΤΕΧΝΙΚΟΣ','SERVICE','ΕΠΙΣΚΕΥ','MAINTENANCE'], category: 'maintenance', label: 'Συντήρηση', confidence: 'low' as const },
  { keywords: ['ΜΙΣΘΩΜΑ','ΕΝΟΙΚΙΟ','RENT','ENARC','ΜΙΣΘΩΣΗ'], category: 'rent_income', label: 'Ενοίκιο', confidence: 'medium' as const },
] as const;

function categorizeTransaction(desc: string) {
  const upper = desc.toUpperCase();
  for (const m of MATCHERS) {
    const hit = (m.keywords as readonly string[]).find(k => upper.includes(k));
    if (hit) return { category: m.category, label: m.label, confidence: m.confidence, matched: hit };
  }
  return { category: 'other', label: 'Άλλο', confidence: 'low' as const, matched: '' };
}

// Δύο ημερομηνίες εντός X ημερών (για συμφωνία πληρωμής ↔ εκκρεμούς λογαριασμού)
function withinDays(a?: string | null, b?: string | null, days = 25): boolean {
  if (!a || !b) return false;
  const diff = Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000;
  return diff <= days;
}

function parseCSV(text: string): ParsedTransaction[] {
  const lines = text.split('\n').filter(l => l.trim());
  const results: ParsedTransaction[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)|;|\t/).map(c => c.trim().replace(/^"|"$/g, ''));
    if (cols.length < 3) continue;
    let date = '', desc = '', amount = 0, debit = true;
    for (const col of cols) {
      if (!date && /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/.test(col)) {
        const parts = col.split(/[\/\-\.]/);
        if (parts.length === 3) {
          const [d, m, y] = parts[0].length === 4 ? [parts[2], parts[1], parts[0]] : parts;
          date = `${y.length === 2 ? '20' + y : y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
        }
      }
      if (!amount) {
        const clean = col.replace(/\./g,'').replace(',','.').replace(/[^0-9.\-]/g,'');
        const n = parseFloat(clean);
        if (!isNaN(n) && Math.abs(n) > 0.01 && Math.abs(n) < 100000) {
          amount = Math.abs(n); debit = n < 0 || col.startsWith('-');
        }
      }
      if (col.length > 4 && !/^\d+[,\.]?\d*$/.test(col) && !/^\d{1,2}[\/\-]\d{1,2}/.test(col)) {
        if (!desc || col.length > desc.length) desc = col;
      }
    }
    if (!date || !amount || !desc) continue;
    const cat = categorizeTransaction(desc);
    results.push({ id: `tx_${i}_${Date.now()}`, date, description: desc, amount, debit, ...cat, selected: debit && cat.category !== 'other', matched: cat.matched });
  }
  return results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

async function parseXLSX(buffer: ArrayBuffer): Promise<ParsedTransaction[]> {
  const XLSX = await import('xlsx');
  const wb   = XLSX.read(buffer, { type: 'array', cellDates: true });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_csv(ws);
  return parseCSV(rows);
}

const CATEGORY_OPTIONS = [
  { value: 'electricity', label: 'Ρεύμα'                    },
  { value: 'water',       label: 'Νερό'                      },
  { value: 'internet',    label: 'Internet & Τηλεφωνία'      },
  { value: 'streaming',   label: 'Streaming & Συνδρομές'     },
  { value: 'gas',         label: 'Φυσικό Αέριο'              },
  { value: 'insurance',   label: 'Ασφάλεια'                  },
  { value: 'taxes',       label: 'ΕΝΦΙΑ & Φόροι'             },
  { value: 'municipal',   label: 'Δημοτικά Τέλη'             },
  { value: 'security',    label: 'Security'                   },
  { value: 'common',      label: 'Κοινόχρηστα'               },
  { value: 'maintenance', label: 'Συντήρηση'                  },
  { value: 'elevator',    label: 'Συντήρηση Ασανσέρ'          },
  { value: 'pool',        label: 'Καθαρισμός Πισίνας'         },
  { value: 'gardener',    label: 'Κηπουρός'                    },
  { value: 'cleaner',     label: 'Καθαριότητα'                },
  { value: 'plumber',     label: 'Υδραυλικός'                 },
  { value: 'electrician', label: 'Ηλεκτρολόγος'               },
  { value: 'rent_income', label: 'Ενοίκιο (Έσοδο)'           },
  { value: 'other',       label: 'Άλλο'                       },
];

const CONFIDENCE_DOT = { high: 'var(--positive)', medium: 'var(--warning)', low: 'var(--text-tertiary)' };
const CONFIDENCE_LBL = { high: 'Σίγουρο', medium: 'Πιθανό', low: 'Άγνωστο' };

// Αντιστοίχιση κατηγορίας → ομάδα/κατηγορία Δαπανών (ίδια λογική με το AI scan,
// ώστε οι εισαγωγές τράπεζας να μπαίνουν στη σωστή ομάδα εξόδων και στην Επισκόπηση).
const EXPENSE_MAP: Record<string, { group: string; cat: string }> = {
  electricity: { group: 'fixed',       cat: 'Ρεύμα' },
  water:       { group: 'fixed',       cat: 'Νερό' },
  gas:         { group: 'fixed',       cat: 'Φυσικό Αέριο' },
  internet:    { group: 'fixed',       cat: 'Internet' },
  streaming:   { group: 'fixed',       cat: 'Άλλη Πάγια' },
  insurance:   { group: 'fixed',       cat: 'Ασφάλεια Κτιρίου' },
  taxes:       { group: 'fixed',       cat: 'ΕΝΦΙΑ' },
  municipal:   { group: 'fixed',       cat: 'Δημοτικά Τέλη' },
  security:    { group: 'fixed',       cat: 'Σύστημα Συναγερμού' },
  common:      { group: 'fixed',       cat: 'Κοινόχρηστα' },
  maintenance: { group: 'maintenance', cat: 'Γενική Συντήρηση' },
  elevator:    { group: 'maintenance', cat: 'Συντήρηση Ασανσέρ' },
  pool:        { group: 'maintenance', cat: 'Καθαρισμός Πισίνας' },
  gardener:    { group: 'maintenance', cat: 'Κηπουρός' },
  cleaner:     { group: 'maintenance', cat: 'Καθαριότητα' },
  plumber:     { group: 'maintenance', cat: 'Υδραυλικός' },
  electrician: { group: 'maintenance', cat: 'Ηλεκτρολόγος' },
  other:       { group: 'other',       cat: 'Άλλο' },
};

const BANKS = [
  'Alpha Bank',
  'Attica Bank',
  'Credia (Παγκρήτια)',
  'Eurobank',
  'Εθνική Τράπεζα (NBG)',
  'Optima Bank',
  'Τράπεζα Πειραιώς',
  'Τράπεζα Θεσσαλίας',
  'N26',
  'Revolut',
  'Wise',
  'Apple Pay',
  'Google Pay',
  'Payzy (Cosmote)',
];

interface Props { propertyId: string; userId?: string; onImported?: (count: number) => void; }

export default function BillsBankImport({ propertyId, userId = '', onImported }: Props) {
  const supabase = createClient();
  const fileRef  = useRef<HTMLInputElement>(null);
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
  const [importing,    setImporting]    = useState(false);
  const [imported,     setImported]     = useState(0);
  const [reconciled,   setReconciled]   = useState(0);
  const [dragOver,     setDragOver]     = useState(false);
  const [error,        setError]        = useState('');
  const [step,         setStep]         = useState<'upload'|'review'|'done'>('upload');
  const [filterCat,    setFilterCat]    = useState('');
  const [selectedBank, setSelectedBank] = useState('');

  const processFile = useCallback(async (file: File) => {
    setError('');
    const ext  = file.name.split('.').pop()?.toLowerCase() ?? '';
    const name = file.name.toLowerCase();

    try {
      setImporting(true);

      if (['csv','txt'].includes(ext)) {
        const text = await file.text();
        const txs  = parseCSV(text);
        if (!txs.length) { setError('Δεν βρέθηκαν συναλλαγές. Βεβαιώσου ότι το αρχείο έχει κεφαλίδες (ημερομηνία, περιγραφή, ποσό).'); return; }
        setTransactions(txs); setStep('review');

      } else if (['xlsx','xls','ods'].includes(ext)) {
        const buf = await file.arrayBuffer();
        const txs = await parseXLSX(buf);
        if (!txs.length) { setError('Δεν βρέθηκαν συναλλαγές στο αρχείο Excel.'); return; }
        setTransactions(txs); setStep('review');

      } else if (ext === 'pdf') {
        const arrayBuffer = await file.arrayBuffer();
        const base64      = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
        const response    = await fetch('/api/anthropic', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            // FIX: 'claude-sonnet-4-6' was not a valid model identifier.
            // Current Claude API model strings: claude-opus-4-8, claude-sonnet-5, claude-haiku-4-5-20251001.
            model: 'claude-sonnet-5', max_tokens: 2000,
            system: `Εξάγαγε ΟΛΕΣ τις χρεωστικές συναλλαγές από αυτό το τραπεζικό αντίγραφο. 
Επέστρεψε ΜΟΝΟ valid JSON array χωρίς markdown ή backticks:
[{"date":"YYYY-MM-DD","description":"ΚΕΦΑΛΑΙΑ","amount":12.50,"debit":true}]
Κανόνες: μόνο χρεώσεις (debit:true), παράλειψε μεταφορές μεταξύ λογαριασμών, συμπέριλαβε ΔΕΗ/ΕΥΔΑΠ/COSMOTE/ΑΑΔΕ.`,
            messages: [{ role: 'user', content: [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
              { type: 'text', text: 'Εξάγαγε τις συναλλαγές.' },
            ]}],
          }),
        });
        const data   = await response.json();
        const text   = (data.content || []).find((c: any) => c.type === 'text')?.text || '[]';
        const clean  = text.replace(/```json?|```/g,'').trim();
        const raw: any[] = JSON.parse(clean);
        const txs = raw.map((r, i) => {
          const cat = categorizeTransaction(r.description || '');
          return { id: `pdf_${i}`, date: r.date || '', description: r.description || '', amount: Math.abs(r.amount || 0), debit: r.debit !== false, ...cat, selected: r.debit !== false && cat.category !== 'other', matched: cat.matched };
        });
        setTransactions(txs); setStep('review');

      } else if (['jpg','jpeg','png','heic','webp','bmp'].includes(ext)) {
        const arrayBuffer = await file.arrayBuffer();
        const base64      = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
        const mimeType    = ext === 'jpg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : ext === 'heic' ? 'image/heic' : 'image/jpeg';
        const response    = await fetch('/api/anthropic', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            // FIX: 'claude-sonnet-4-6' was not a valid model identifier.
            // Current Claude API model strings: claude-opus-4-8, claude-sonnet-5, claude-haiku-4-5-20251001.
            model: 'claude-sonnet-5', max_tokens: 2000,
            system: `Εξάγαγε συναλλαγές ή στοιχεία λογαριασμού από αυτή την εικόνα.
Αν είναι τραπεζικό αντίγραφο: JSON array [{"date":"YYYY-MM-DD","description":"...","amount":12.50,"debit":true}]
Αν είναι λογαριασμός (ΔΕΗ/ΕΥΔΑΠ κτλ): JSON object {"provider":"...","amount":45.50,"due_date":"YYYY-MM-DD","period":"...","category":"electricity"}
Επέστρεψε ΜΟΝΟ JSON χωρίς markdown.`,
            messages: [{ role: 'user', content: [
              { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
              { type: 'text', text: 'Εξάγαγε τα δεδομένα.' },
            ]}],
          }),
        });
        const data  = await response.json();
        const text  = (data.content || []).find((c: any) => c.type === 'text')?.text || '{}';
        const clean = text.replace(/```json?|```/g,'').trim();
        const raw   = JSON.parse(clean);
        const arr   = Array.isArray(raw) ? raw : [raw];
        const txs   = arr.map((r: any, i: number) => {
          const cat = categorizeTransaction(r.description || r.provider || '');
          return { id: `img_${i}`, date: r.date || r.due_date || new Date().toISOString().split('T')[0], description: r.description || r.provider || 'Λογαριασμός', amount: Math.abs(r.amount || 0), debit: true, ...cat, selected: true, matched: cat.matched };
        }).filter(t => t.amount > 0);
        setTransactions(txs); setStep('review');

      } else {
        setError(`Μη υποστηριζόμενος τύπος αρχείου. Υποστηριζόμενα: CSV, Excel, PDF, εικόνες (JPG, PNG, HEIC)`);
      }
    } catch (e) {
      setError('Σφάλμα ανάλυσης αρχείου. Δοκίμασε ξανά ή επίλεξε διαφορετικό αρχείο.');
      console.error(e);
    } finally { setImporting(false); }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const toggleTx  = (id: string) => setTransactions(p => p.map(t => t.id === id ? { ...t, selected: !t.selected } : t));
  const setCat    = (id: string, cat: string) => setTransactions(p => p.map(t => t.id === id ? { ...t, category: cat } : t));
  const selectAll = (val: boolean) => setTransactions(p => p.map(t => ({ ...t, selected: val })));

  const importSelected = async () => {
    const selected = transactions.filter(t => t.selected && t.debit);
    if (!selected.length) return;
    setImporting(true);
    try {
      // ── Μηχανή Συμφωνίας (reconciliation) ────────────────────────────────
      // Κάθε τραπεζική πληρωμή ψάχνει τον αντίστοιχο ΕΚΚΡΕΜΗ λογαριασμό (ίδιο
      // ποσό ±2% & κοντινή ημερομηνία, με προτίμηση ίδιας κατηγορίας). Αν βρεθεί,
      // ο λογαριασμός μαρκάρεται ΠΛΗΡΩΜΕΝΟΣ παντού (Λογαριασμοί + Έξοδα + Ημερολόγιο)
      // αντί να δημιουργηθεί διπλότυπο. Ό,τι δεν ταιριάζει → νέα εγγραφή.
      const { data: pend } = await supabase.from('bills')
        .select('id,category,amount,due_date,created_at')
        .eq('property_id', propertyId).eq('paid', false);
      const pendingBills = (pend || []) as { id: string; category: string; amount: number; due_date: string | null; created_at: string | null }[];
      const usedBill = new Set<string>();
      // billAmount = το ποσό του ΛΟΓΑΡΙΑΣΜΟΥ (όχι της πληρωμής): με αυτό εντοπίζουμε
      // το συνδεδεμένο έξοδο/γεγονός, γιατί η πληρωμή μπορεί να διαφέρει κατά λεπτά.
      const matched: { billId: string; cat: string; billAmount: number }[] = [];
      const unmatched: ParsedTransaction[] = [];

      for (const t of selected) {
        const cands = pendingBills.filter(b => !usedBill.has(b.id)
          && Math.abs((b.amount || 0) - t.amount) <= Math.max(0.5, t.amount * 0.02)
          && withinDays(b.due_date || b.created_at, t.date, 25));
        const m = cands.find(b => b.category === t.category) || cands[0];
        if (m) { usedBill.add(m.id); matched.push({ billId: m.id, cat: m.category, billAmount: m.amount }); }
        else unmatched.push(t);
      }

      // 1) Συμφώνησε τα ταιριασμένα — μαρκάρισμα «Πληρώθηκε» παντού.
      // Προτεραιότητα σε ΑΚΡΙΒΗ σύνδεση μέσω bill_id· αν δεν βρεθεί (παλιά δεδομένα
      // χωρίς σύνδεσμο), fallback σε ταίριασμα ποσού+κατηγορίας.
      if (matched.length) {
        await supabase.from('bills').update({ paid: true }).in('id', matched.map(r => r.billId));
        for (const r of matched) {
          const em = EXPENSE_MAP[r.cat] || EXPENSE_MAP.other;
          const { data: expHit } = await supabase.from('expenses').update({ paid: true })
            .eq('bill_id', r.billId).eq('paid', false).select('id');
          if (!expHit || !expHit.length) {
            await supabase.from('expenses').update({ paid: true })
              .eq('property_id', propertyId).eq('category', em.cat)
              .eq('amount', r.billAmount).eq('paid', false).is('bill_id', null);
          }
          const { data: evHit } = await supabase.from('calendar_events').update({ status: 'paid' })
            .eq('bill_id', r.billId).eq('status', 'pending').select('id');
          if (!evHit || !evHit.length) {
            await supabase.from('calendar_events').update({ status: 'paid' })
              .eq('property_id', propertyId).eq('amount', r.billAmount).eq('status', 'pending').is('bill_id', null);
          }
        }
      }

      // 2) Τα αταίριαστα → νέα εγγραφή (Λογαριασμός + Έξοδο) με προστασία διπλότυπου
      let created = 0;
      if (unmatched.length) {
        const rows = unmatched.map(t => ({
          property_id: propertyId, user_id: userId, category: t.category,
          name: t.description.slice(0, 100), amount: t.amount, paid: true,
          due_date: t.date, created_at: new Date(t.date).toISOString(),
          notes: `Εισαγωγή από τράπεζα${selectedBank ? ` (${selectedBank})` : ''} · ${t.matched || ''}`,
          recurring: false,
        }));
        const { error: err } = await supabase.from('bills').insert(rows);
        if (err) throw err;
        created = rows.length;

        const dates = unmatched.map(t => t.date).sort();
        const { data: existing } = await supabase.from('expenses')
          .select('amount,category,date').eq('property_id', propertyId)
          .gte('date', dates[0]).lte('date', dates[dates.length - 1]);
        const seen = new Set((existing || []).map(e => `${e.amount}|${e.category}|${e.date}`));
        await Promise.allSettled(unmatched.map(t => {
          const m = EXPENSE_MAP[t.category] || EXPENSE_MAP.other;
          const key = `${t.amount}|${m.cat}|${t.date}`;
          if (seen.has(key)) return Promise.resolve();
          seen.add(key);
          return supabase.from('expenses').insert({
            property_id: propertyId, user_id: userId, amount: t.amount,
            description: t.description.slice(0, 100), date: t.date,
            category: m.cat, expense_group: m.group, paid_by: 'owner', paid: true,
            notes: `Εισαγωγή από τράπεζα${selectedBank ? ` (${selectedBank})` : ''}`,
          });
        }));
      }

      setReconciled(matched.length); setImported(created); setStep('done');
      onImported?.(created + matched.length);
    } catch (e) {
      setError('Σφάλμα αποθήκευσης. Δοκίμασε ξανά.'); console.error(e);
    } finally { setImporting(false); }
  };

  const filtered    = filterCat ? transactions.filter(t => t.category === filterCat) : transactions;
  const selectedCnt = transactions.filter(t => t.selected).length;
  const totalAmt    = transactions.filter(t => t.selected && t.debit).reduce((s, t) => s + t.amount, 0);

  if (step === 'done') return (
    <div style={{ textAlign: 'center', padding: 60, fontFamily: T.font.sans }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(52,168,83,0.12)', border: '1px solid rgba(52,168,83,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
        <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="var(--positive)" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10, letterSpacing: '-0.02em' }}>Εισαγωγή Ολοκληρώθηκε</div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        {reconciled > 0 && (
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--positive)', background: 'rgba(52,168,83,0.1)', border: '1px solid rgba(52,168,83,0.25)', borderRadius: T.radius.pill, padding: '5px 14px', fontFamily: T.font.sans }}>
            ✓ {reconciled} εκκρεμείς λογαριασμοί εξοφλήθηκαν
          </span>
        )}
        {imported > 0 && (
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: T.radius.pill, padding: '5px 14px', fontFamily: T.font.sans }}>
            + {imported} νέες εγγραφές
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 28 }}>Ενημερώθηκαν αυτόματα Λογαριασμοί, Έξοδα και Ημερολόγιο</div>
      <button onClick={() => { setStep('upload'); setTransactions([]); setImported(0); setReconciled(0); setError(''); }}
        style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: T.radius.pill, padding: '10px 28px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: T.font.sans }}>
        Νέα Εισαγωγή
      </button>
    </div>
  );

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>Εισαγωγή Τραπεζικού Λογαριασμού</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Αυτόματη αναγνώριση ΔΕΗ, ΕΥΔΑΠ, COSMOTE, ΑΑΔΕ — CSV, Excel, PDF, εικόνες</div>
      </div>

      {step === 'upload' && (
        <>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, letterSpacing: "0.3px", color: "var(--text-secondary)", marginBottom: 8, fontFamily: T.font.sans }}>Τράπεζα <span style={{ fontSize: 10, fontWeight: 400, color: "var(--text-tertiary)" }}>(προαιρετικό)</span></label>
            <select value={selectedBank} onChange={e => setSelectedBank(e.target.value)}
              style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: T.radius.inner, padding: '11px 16px', color: selectedBank ? 'var(--text-primary)' : 'var(--text-tertiary)', fontSize: 14, fontFamily: T.font.sans, outline: 'none', cursor: 'pointer' }}>
              <option value="">— Επιλογή τράπεζας —</option>
              {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          <div
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => fileRef.current?.click()}
            style={{ border: `1px solid ${dragOver ? 'var(--accent)' : 'var(--border-default)'}`, borderRadius: T.radius.card, padding: '44px 32px', textAlign: 'center', cursor: 'pointer', background: dragOver ? 'rgba(26,115,232,0.03)' : 'var(--bg-elevated)', transition: 'all 0.2s', marginBottom: 20 }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'rgba(26,115,232,0.03)'; }}
            onMouseLeave={e => { if (!dragOver) { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.background = 'var(--bg-elevated)'; } }}>
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
              <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
              </svg>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>Ανέβασε Αρχείο Τράπεζας</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>Σύρε εδώ ή κάνε κλικ για επιλογή</div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
              {['CSV','Excel','PDF','JPG','PNG','HEIC','TXT'].map(f => (
                <span key={f} style={{ fontSize: 10, color: 'var(--text-tertiary)', background: 'var(--bg-surface)', padding: '4px 10px', borderRadius: T.radius.badge, border: '1px solid var(--border-subtle)', fontFamily: T.font.mono }}>{f}</span>
              ))}
            </div>
          </div>
          <input ref={fileRef} type="file"
            accept=".csv,.txt,.pdf,.xlsx,.xls,.ods,.jpg,.jpeg,.png,.heic,.webp,.bmp"
            style={{ display: 'none' }} onChange={e => e.target.files?.[0] && processFile(e.target.files[0])}/>

          {importing && (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)', fontSize: 12, fontFamily: T.font.sans }}>
              Ανάλυση αρχείου με AI — παρακαλώ περίμενε...
            </div>
          )}
          {error && (
            <div style={{ background: 'rgba(197,34,31,0.07)', border: '1px solid rgba(197,34,31,0.25)', borderRadius: T.radius.inner, padding: '12px 16px', fontSize: 12, color: 'var(--negative)', fontFamily: T.font.sans }}>{error}</div>
          )}

          <div style={{ background: 'var(--bg-surface)', borderRadius: T.radius.card, border: '1px solid var(--border-subtle)', padding: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, fontFamily: T.font.sans }}>{selectedBank ? `Οδηγίες ${selectedBank}` : 'Εξαγωγή Κινήσεων ανά Τράπεζα'}</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 16, fontFamily: T.font.sans }}>{selectedBank ? `Οδηγίες εξαγωγής για ${selectedBank} — ακολούθησε τα παρακάτω βήματα` : 'Επίλεξε τράπεζα παραπάνω ή πάτα οποιαδήποτε κάρτα για αναλυτικές οδηγίες'}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(() => {
                const ALL_BANK_INSTRUCTIONS: Record<string, { sub: string; steps: string[]; format: string; url: string }> = {
                  'Alpha Bank':             { sub: 'MyAlpha',       format: 'CSV',      url: 'https://www.alpha.gr', steps: ['Σύνδεση στο MyAlpha','Λογαριασμοί','Κινήσεις','Επιλογή περιόδου','Εξαγωγή CSV'] },
                  'Attica Bank':            { sub: 'e-Banking',     format: 'CSV',      url: 'https://www.atticabank.gr', steps: ['Σύνδεση e-Banking','Λογαριασμοί','Κινήσεις Λογαριασμού','Λήψη CSV'] },
                  'Credia (Παγκρήτια)':     { sub: 'e-Banking',     format: 'Excel/CSV',url: 'https://www.credia.gr', steps: ['Σύνδεση e-Banking','Κινήσεις','Εξαγωγή αρχείου'] },
                  'Eurobank':               { sub: 'e-Banking',     format: 'Excel',    url: 'https://www.eurobank.gr', steps: ['Σύνδεση e-Banking','Λογαριασμοί','Κινήσεις','Εξαγωγή'] },
                  'Εθνική Τράπεζα (NBG)':   { sub: 'NBG Mobile / i-bank', format: 'CSV', url: 'https://www.nbg.gr', steps: ['Σύνδεση i-bank ή NBG Mobile','Λογαριασμοί','Κινήσεις','Εξαγωγή CSV'] },
                  'Optima Bank':            { sub: 'e-Banking',     format: 'CSV',      url: 'https://www.optimabank.gr', steps: ['Σύνδεση e-Banking','Λογαριασμοί','Εξαγωγή CSV'] },
                  'Τράπεζα Πειραιώς':       { sub: 'winbank',       format: 'Excel/CSV',url: 'https://www.piraeusbank.gr', steps: ['Σύνδεση winbank','Λογαριασμοί','Κινήσεις','Λήψη Excel ή CSV'] },
                  'Τράπεζα Θεσσαλίας':      { sub: 'e-Banking',     format: 'CSV',      url: 'https://www.bankofthessaly.gr', steps: ['Σύνδεση e-Banking','Κινήσεις','Εξαγωγή'] },
                  'N26':                    { sub: 'N26 App',       format: 'CSV',      url: 'https://n26.com', steps: ['Άνοιξε N26 App','Λογαριασμός','Εξαγωγή Κινήσεων','Επιλογή μορφής CSV'] },
                  'Revolut':                { sub: 'Revolut App',   format: 'CSV/PDF',  url: 'https://www.revolut.com', steps: ['Άνοιξε Revolut App','Λογαριασμός','Λήψη αντιγράφου κίνησης','CSV ή PDF'] },
                  'Wise':                   { sub: 'Wise App/Web',  format: 'CSV',      url: 'https://wise.com', steps: ['Σύνδεση Wise','Κινήσεις (Transactions)','Κατέβασε CSV'] },
                };

                const selected = selectedBank && ALL_BANK_INSTRUCTIONS[selectedBank];

                if (selected) {
                  return (
                    <div style={{ background: 'var(--bg-base)', borderRadius: T.radius.inner, padding: '14px 16px', border: '1px solid var(--border-default)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.sans, marginBottom: 2 }}>{selectedBank}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>Μέσω {selected.sub} · Μορφή αρχείου: <span style={{ fontFamily: T.font.mono, color: 'var(--accent)' }}>{selected.format}</span></div>
                        </div>
                        <a href={selected.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, fontWeight: 600, color: 'var(--info)', border: '1px solid rgba(26,115,232,0.25)', borderRadius: T.radius.pill, padding: '4px 12px', textDecoration: 'none', fontFamily: T.font.sans, whiteSpace: 'nowrap' }}>
                          Άνοιξε {selected.sub} →
                        </a>
                      </div>
                      <div style={{ display: 'flex', gap: 0, flexDirection: 'column' }}>
                        {selected.steps.map((step, si) => (
                          <div key={si} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: si < selected.steps.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                            <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: 'var(--accent)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{si + 1}</div>
                            <span style={{ fontSize: 12, color: 'var(--text-primary)', fontFamily: T.font.sans }}>{step}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }

                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 6 }}>
                    {Object.entries(ALL_BANK_INSTRUCTIONS).map(([name, info], i) => (
                      <div key={i} onClick={() => setSelectedBank(name)}
                        style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '8px 12px', cursor: 'pointer', transition: 'all 0.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'rgba(26,115,232,0.03)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.background = 'var(--bg-base)'; }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans, marginBottom: 2 }}>{name}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>{info.sub} · {info.format}</div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </>
      )}

      {step === 'review' && transactions.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Συναλλαγές',    value: String(transactions.length) },
              { label: 'Επιλεγμένες',   value: String(selectedCnt)         },
              { label: 'Ποσό εισαγωγής', value: fe(totalAmt)               },
              { label: 'Αναγνωρίστηκαν', value: `${transactions.filter(t => t.confidence === 'high').length} / ${transactions.length}` },
            ].map((k, i) => (
              <div key={i} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '12px 16px' }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, fontFamily: T.font.sans }}>{k.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{k.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
              style={{ fontSize: 11, padding: '7px 12px', borderRadius: T.radius.btn, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', cursor: 'pointer', outline: 'none', fontFamily: T.font.sans }}>
              <option value="">Όλες οι κατηγορίες</option>
              {CATEGORY_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <button onClick={() => selectAll(true)} style={{ fontSize: 11, padding: '7px 12px', borderRadius: T.radius.btn, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: T.font.sans }}>Επιλογή όλων</button>
            <button onClick={() => selectAll(false)} style={{ fontSize: 11, padding: '7px 12px', borderRadius: T.radius.btn, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: T.font.sans }}>Αποεπιλογή</button>
            <div style={{ flex: 1 }}/>
            <button onClick={() => { setStep('upload'); setTransactions([]); setError(''); }}
              style={{ fontSize: 11, padding: '7px 14px', borderRadius: T.radius.btn, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: T.font.sans }}>← Πίσω</button>
            <button onClick={importSelected} disabled={importing || selectedCnt === 0}
              style={{ fontSize: 12, fontWeight: 700, padding: '8px 24px', borderRadius: T.radius.btn, border: 'none', background: selectedCnt > 0 ? 'var(--accent)' : 'var(--bg-elevated)', color: selectedCnt > 0 ? 'var(--accent-text)' : 'var(--text-tertiary)', cursor: selectedCnt > 0 ? 'pointer' : 'not-allowed', fontFamily: T.font.sans }}>
              {importing ? 'Εισαγωγή...' : `Εισαγωγή ${selectedCnt} συναλλαγών`}
            </button>
          </div>

          <div style={{ background: 'var(--bg-surface)', borderRadius: T.radius.card, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
            {filtered.map((tx, i) => (
              <div key={tx.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < filtered.length - 1 ? '1px solid var(--border-subtle)' : 'none', background: tx.selected ? 'rgba(26,115,232,0.03)' : 'transparent', transition: 'background 0.1s' }}>
                <input type="checkbox" checked={tx.selected} onChange={() => toggleTx(tx.id)}
                  style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0, accentColor: 'var(--accent)' }}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: T.font.sans, marginBottom: 3 }}>{tx.description}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>{new Date(tx.date).toLocaleDateString('el-GR')}</span>
                    {tx.matched && <span style={{ fontSize: 9, color: 'var(--text-tertiary)', background: 'var(--bg-elevated)', padding: '1px 6px', borderRadius: 3, fontFamily: T.font.sans }}>↳ {tx.matched}</span>}
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: CONFIDENCE_DOT[tx.confidence], fontFamily: T.font.sans }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: CONFIDENCE_DOT[tx.confidence], display: 'inline-block' }}/>
                      {CONFIDENCE_LBL[tx.confidence]}
                    </span>
                  </div>
                </div>
                <select value={tx.category} onChange={e => setCat(tx.id, e.target.value)}
                  style={{ fontSize: 10, padding: '4px 8px', borderRadius: T.radius.badge, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer', outline: 'none', fontFamily: T.font.sans }}>
                  {CATEGORY_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                <div style={{ textAlign: 'right', minWidth: 80 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', color: tx.debit ? 'var(--negative)' : 'var(--positive)' }}>
                    {tx.debit ? '-' : '+'}{fe(tx.amount)}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {error && <div style={{ marginTop: 12, background: 'rgba(197,34,31,0.07)', border: '1px solid rgba(197,34,31,0.25)', borderRadius: T.radius.inner, padding: '10px 14px', fontSize: 12, color: 'var(--negative)', fontFamily: T.font.sans }}>{error}</div>}
        </>
      )}
    </div>
  );
}