'use client';

import { useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, feAuto } from '@/components/Theme';
import { CustomSelect } from './UIComponents';
import { parseCSV } from '@/lib/billing/parse';

// ── Μαζική εισαγωγή δαπανών από αρχείο (CSV / Excel) ─────────────────────────
// Διαβάζει τραπεζικό αντίγραφο ή λίστα εξόδων, αναγνωρίζει αυτόματα ημερομηνία,
// ποσό και κατηγορία (μέσω του δοκιμασμένου parse.ts), και μετά από έλεγχο του
// χρήστη δημιουργεί εγγραφές δαπανών με τη σωστή κατηγορία και τον σωστό μήνα.
// Καθαρό, μινιμαλ, μονόχρωμο — καμία διακοσμητική χρωματική.

// Κατηγορία parser → κατηγορία προϋπολογισμού (ώστε να ταιριάζει με τον χάρτη του BillsBudget).
const PARSE_TO_BUDGET: Record<string, string> = {
  electricity: 'electricity', water: 'water', gas: 'heating', internet: 'internet',
  streaming: 'insurance', insurance: 'insurance', taxes: 'services', municipal: 'services',
  security: 'other', common: 'common', maintenance: 'maintenance', elevator: 'maintenance',
  pool: 'maintenance', gardener: 'maintenance', cleaner: 'maintenance', plumber: 'maintenance',
  electrician: 'maintenance', rent_income: '', other: 'other',
};

interface Row { id: string; date: string; description: string; amount: number; catKey: string; selected: boolean }

interface Props {
  propertyId: string;
  userId?: string;
  cats: { key: string; label: string }[];
  onImported?: () => void;
}

export default function BudgetImport({ propertyId, userId = '', cats, onImported }: Props) {
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [fileName, setFileName] = useState('');
  const [hover, setHover] = useState(false);

  const catOptions = cats.map(c => ({ value: c.key, label: c.label }));

  const handleFile = async (file: File) => {
    setErr(''); setBusy(true); setFileName(file.name);
    try {
      let text: string;
      const isExcel = /\.(xlsx|xls)$/i.test(file.name);
      if (isExcel) {
        const XLSX = await import('xlsx');
        const buf = await file.arrayBuffer();
        // cellDates: οι ημερομηνίες του Excel να διαβαστούν ως ημερομηνίες (όχι σειριακοί αριθμοί).
        const wb = XLSX.read(buf, { type: 'array', cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        text = XLSX.utils.sheet_to_csv(sheet, { dateNF: 'yyyy-mm-dd' });
      } else {
        text = await file.text();
      }
      const parsed = parseCSV(text).filter(t => t.debit);   // μόνο έξοδα (όχι πιστώσεις/έσοδα)
      const mapped: Row[] = parsed.map(t => {
        const budgetKey = PARSE_TO_BUDGET[t.category] ?? 'other';
        return { id: t.id, date: t.date, description: t.description, amount: t.amount, catKey: budgetKey || 'other', selected: budgetKey !== '' };
      });
      if (!mapped.length) setErr('Δεν βρέθηκαν έγκυρες δαπάνες στο αρχείο. Έλεγξε ότι υπάρχουν στήλες ημερομηνίας, ποσού και περιγραφής.');
      setRows(mapped);
    } catch {
      setErr('Δεν ήταν δυνατή η ανάγνωση του αρχείου. Δοκίμασε CSV ή Excel (.xlsx).');
    } finally { setBusy(false); }
  };

  const selectedCount = rows?.filter(r => r.selected).length ?? 0;
  const selectedTotal = rows?.filter(r => r.selected).reduce((s, r) => s + r.amount, 0) ?? 0;

  const doImport = async () => {
    if (!rows || !selectedCount) return;
    setBusy(true); setErr('');
    try {
      // Ασφάλεια: μόνο γραμμές με έγκυρη ISO ημερομηνία φτάνουν στη βάση, ώστε μια «κακή»
      // γραμμή (footer/περίεργη μορφή) να μη ρίχνει όλη την εισαγωγή.
      const valid = rows.filter(r => r.selected && /^\d{4}-\d{2}-\d{2}$/.test(r.date));
      if (!valid.length) { setErr('Καμία γραμμή με έγκυρη ημερομηνία για εισαγωγή.'); setBusy(false); return; }
      const payload = valid.map(r => ({
        property_id: propertyId, user_id: userId || null,
        amount: r.amount, date: r.date, description: r.description.slice(0, 200),
        category: r.catKey, expense_group: r.catKey === 'maintenance' ? 'maintenance' : 'other',
        bill_id: null,
      }));
      const { error } = await supabase.from('expenses').insert(payload);
      if (error) { setErr('Η εισαγωγή απέτυχε. Δοκίμασε ξανά.'); return; }
      setRows(null); setFileName('');
      onImported?.();
    } finally { setBusy(false); }
  };

  const reset = () => { setRows(null); setErr(''); setFileName(''); };

  return (
    <div>
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.txt,text/csv" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.currentTarget.value = ''; }} />

      {!rows && (
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
          onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: T.radius.inner, border: `1px solid ${hover ? 'var(--border-default)' : 'var(--border-subtle)'}`, background: hover ? 'var(--bg-elevated)' : 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, fontFamily: T.font.sans, cursor: busy ? 'default' : 'pointer', transition: 'all 0.15s' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          {busy ? 'Ανάγνωση…' : 'Εισαγωγή από αρχείο (CSV / Excel)'}
        </button>
      )}

      {err && !rows && <div style={{ marginTop: 8, fontSize: 11, color: 'var(--negative)', fontFamily: T.font.sans }}>{err}</div>}

      {rows && (
        <div style={{ marginTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans }}>{fileName}</span>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>{rows.length} εγγραφές αναγνωρίστηκαν</span>
            <span style={{ flex: 1 }} />
            <button type="button" onClick={reset} style={{ border: 'none', background: 'transparent', color: 'var(--text-tertiary)', fontSize: 12, cursor: 'pointer', fontFamily: T.font.sans }}>Ακύρωση</button>
          </div>

          {err && <div style={{ marginBottom: 10, fontSize: 11, color: 'var(--negative)', fontFamily: T.font.sans }}>{err}</div>}

          {rows.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto', paddingRight: 2 }}>
              {rows.map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: T.radius.inner, border: '1px solid var(--border-subtle)', background: r.selected ? 'var(--bg-elevated)' : 'transparent', opacity: r.selected ? 1 : 0.5, transition: 'opacity 0.15s, background 0.15s' }}>
                  <button type="button" onClick={() => setRows(rs => rs!.map(x => x.id === r.id ? { ...x, selected: !x.selected } : x))} aria-label="Επιλογή"
                    style={{ width: 18, height: 18, flexShrink: 0, borderRadius: 6, border: `1.5px solid ${r.selected ? 'var(--accent)' : 'var(--border-default)'}`, background: r.selected ? 'var(--accent)' : 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                    {r.selected && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                  </button>
                  <span style={{ width: 66, flexShrink: 0, fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{/^\d{4}-\d{2}-\d{2}$/.test(r.date) ? `${r.date.slice(8, 10)}/${r.date.slice(5, 7)}/${r.date.slice(2, 4)}` : '·'}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--text-primary)', fontFamily: T.font.sans, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</span>
                  <div style={{ width: 168, flexShrink: 0 }}>
                    <CustomSelect value={r.catKey} onChange={v => setRows(rs => rs!.map(x => x.id === r.id ? { ...x, catKey: v } : x))} options={catOptions} />
                  </div>
                  <span style={{ width: 66, textAlign: 'right', flexShrink: 0, fontSize: 12, fontWeight: 700, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{feAuto(r.amount)}</span>
                </div>
              ))}
            </div>
          )}

          {rows.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
              <button type="button" onClick={doImport} disabled={busy || !selectedCount}
                style={{ height: T.h.md, padding: '0 18px', borderRadius: T.radius.inner, border: 'none', background: selectedCount && !busy ? 'var(--accent)' : 'var(--bg-elevated)', color: selectedCount && !busy ? 'var(--accent-text)' : 'var(--text-tertiary)', fontSize: 12, fontWeight: 700, fontFamily: T.font.sans, cursor: selectedCount && !busy ? 'pointer' : 'default', transition: 'all 0.15s' }}>
                {busy ? 'Εισαγωγή…' : `Εισαγωγή ${selectedCount} δαπανών`}
              </button>
              {selectedCount > 0 && <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>Σύνολο <span style={{ fontFamily: T.font.num, color: 'var(--text-secondary)' }}>{feAuto(selectedTotal)}</span></span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
