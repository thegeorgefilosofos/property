'use client';

// ═══════════════════════════════════════════════════════════════════════════
// /verify/<id> — δημόσια σελίδα επαλήθευσης γνησιότητας εγγράφου (χωρίς login).
// Ο αναγνώστης (τράπεζα, ΔΟΥ, φορέας) σκανάρει το QR του PDF και βλέπει ότι το
// έγγραφο εκδόθηκε πραγματικά από το Property OS: τύπος, αντικείμενο, περίοδος,
// ημ. έκδοσης, εκδότης. Καμία ευαίσθητη πληροφορία/ποσά.
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface Verified {
  id: string; doc_type: string; subject: string; period: string; issued_at: string; issuer: string;
}

const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleString('el-GR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default function VerifyDocument() {
  const params = useParams();
  const id = String(params?.id || '');
  const supabase = createClient();
  const [state, setState] = useState<'loading' | 'ok' | 'notfound'>('loading');
  const [doc, setDoc] = useState<Verified | null>(null);

  useEffect(() => {
    setState('loading');
    (async () => {
      const { data, error } = await supabase.rpc('verify_document', { p_id: id });
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row) { setState('notfound'); return; }
      setDoc(row as Verified);
      setState('ok');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const wrap: React.CSSProperties = { minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'Inter, system-ui, Arial, sans-serif', color: 'var(--text-primary)' };
  const card: React.CSSProperties = { width: '100%', maxWidth: 460, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: '30px 30px 26px', boxShadow: '0 1px 3px rgba(0,0,0,.08)' };
  const mark: React.CSSProperties = { width: 34, height: 34, borderRadius: 8, background: 'var(--accent)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 17 };
  const label: React.CSSProperties = { fontSize: 9.5, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700 };
  const value: React.CSSProperties = { fontSize: 14, color: 'var(--text-primary)', fontWeight: 600, marginTop: 3 };

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, paddingBottom: 18, borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={mark}>P</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Property OS</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Επαλήθευση γνησιότητας εγγράφου</div>
          </div>
        </div>

        {state === 'loading' && (
          <div style={{ padding: '34px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>Έλεγχος εγγράφου…</div>
        )}

        {state === 'notfound' && (
          <div style={{ paddingTop: 24 }}>
            <div style={{ fontSize: 40, lineHeight: 1 }}>⚠️</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 12 }}>Δεν βρέθηκε έγγραφο</div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: 8 }}>
              Ο κωδικός <strong style={{ color: 'var(--text-primary)' }}>{id || '—'}</strong> δεν αντιστοιχεί σε έγγραφο που εκδόθηκε από το Property OS.
              Ελέγξτε ότι σαρώσατε σωστά το QR ή ζητήστε νέο αντίγραφο από τον εκδότη.
            </p>
          </div>
        )}

        {state === 'ok' && doc && (
          <div style={{ paddingTop: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--positive-soft)', border: '1px solid var(--positive-border)', borderRadius: 10, padding: '11px 14px' }}>
              <span style={{ color: 'var(--positive)', fontSize: 18, fontWeight: 700 }}>✓</span>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--positive)' }}>Γνήσιο έγγραφο, εκδόθηκε από το Property OS</span>
            </div>

            <div style={{ display: 'grid', gap: 16, marginTop: 22 }}>
              <div><div style={label}>Τύπος εγγράφου</div><div style={value}>{doc.doc_type}</div></div>
              {doc.subject && <div><div style={label}>Αντικείμενο</div><div style={value}>{doc.subject}</div></div>}
              {doc.period && <div><div style={label}>Περίοδος</div><div style={value}>{doc.period}</div></div>}
              <div><div style={label}>Ημερομηνία έκδοσης</div><div style={value}>{fmtDateTime(doc.issued_at)}</div></div>
              <div><div style={label}>Εκδότης</div><div style={value}>{doc.issuer}</div></div>
              <div><div style={label}>Αριθμός εγγράφου</div><div style={{ ...value, fontVariantNumeric: 'tabular-nums', letterSpacing: '.02em' }}>{doc.id}</div></div>
            </div>

            <p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', lineHeight: 1.6, marginTop: 24, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
              Η σελίδα επιβεβαιώνει ότι το έγγραφο με τον παραπάνω κωδικό δημιουργήθηκε από την πλατφόρμα Property OS.
              Δεν εμφανίζονται ποσά ή ευαίσθητα στοιχεία. Το περιεχόμενο του εγγράφου παραμένει ευθύνη του εκδότη.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
