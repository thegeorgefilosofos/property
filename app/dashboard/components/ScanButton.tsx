'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ScanButton — μικρό, ομοιόμορφο κουμπί «σκαναρίσματος» εγγράφου για auto-prefill.
// Ανοίγει επιλογή αρχείου (φωτό/PDF), το διαβάζει με το vision endpoint και
// δίνει πίσω το δομημένο έγγραφο μέσω onExtract. Ο χρήστης μετά επεξεργάζεται
// ελεύθερα τα πεδία — δεν αντικαθιστά, απλώς γεμίζει.
// ═══════════════════════════════════════════════════════════════════════════
import { useRef, useState } from 'react';
import { T } from '@/components/Theme';
import { scanDocument } from './scanDoc';
import type { ScannedDoc } from '@/lib/billing/documents';

// ΤΟ ΟΝΟΜΑ ΠΡΕΠΕΙ ΝΑ ΛΕΕΙ ΤΙ ΘΑ ΓΙΝΕΙ. Και οι τρεις καλούντες έγραφαν «Σάρωσε
// έγγραφο» — ακριβώς η ίδια λέξη με το κεντρικό κουμπί της εφαρμογής, που όμως
// κάνει ΑΛΛΟ πράγμα: εκείνο καταχωρεί σε λογαριασμούς, δαπάνες και ημερολόγιο,
// αυτό εδώ απλώς γεμίζει τη φόρμα που έχεις μπροστά σου. Ο χρήστης δεν μπορούσε
// να προβλέψει αν η φωτογραφία του θα αποθηκευτεί ή όχι.
export default function ScanButton({ label, hint, onExtract }: { label: string; hint?: string; onExtract: (doc: ScannedDoc) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const handle = async (f: File) => {
    setBusy(true); setErr('');
    const r = await scanDocument(f);
    setBusy(false);
    if (r.doc) onExtract(r.doc);
    else setErr(r.error === 'big' ? 'Πολύ μεγάλο αρχείο (όριο 10MB).' : r.error === 'key_missing' ? 'Η αυτόματη ανάγνωση δεν είναι ενεργή.' : 'Δεν διάβασα καθαρά το έγγραφο. Δοκίμασε καθαρότερη φωτό ή PDF.');
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      {/* Ύψος από την κοινή κλίμακα (T.h.sm) και όχι literal 32: το ίδιο pill κουμπί
          υπάρχει σε τρία σημεία (InsightsBoard, ObligationsPanel, εδώ) και όποιο
          άλλαζε χειροκίνητα ξέφευγε σιωπηλά από τα υπόλοιπα. */}
      <button type="button" onClick={() => ref.current?.click()} disabled={busy}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: T.h.sm, padding: '0 14px', borderRadius: 10, border: `1px solid ${busy ? 'var(--accent-border)' : 'var(--border-default)'}`, background: busy ? 'var(--accent-soft)' : 'var(--bg-surface)', color: busy ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', fontFamily: T.font.sans, transition: 'border-color 0.14s, color 0.14s' }}
        onMouseEnter={e => { if (!busy) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; } }}
        onMouseLeave={e => { if (!busy) { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-secondary)'; } }}>
        {busy
          ? <><span className="live-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />Ανάγνωση…</>
          : <><svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><path d="M7 12h10" /></svg>{label}</>}
      </button>
      {hint && !busy && !err && <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.4 }}>{hint}</span>}
      {err && <span style={{ fontSize: 12, color: 'var(--negative)', fontFamily: T.font.sans }}>{err}</span>}
      <input ref={ref} type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handle(f); e.currentTarget.value = ''; }} />
    </div>
  );
}
