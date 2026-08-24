'use client';

// ═══════════════════════════════════════════════════════════════════════════
// /verify/<id> — δημόσια σελίδα επαλήθευσης γνησιότητας εγγράφου (χωρίς login).
// Ο αναγνώστης (τράπεζα, ΔΟΥ, φορέας) σκανάρει το QR του PDF και βλέπει ότι το
// έγγραφο εκδόθηκε πραγματικά από το PROPERWISE: τύπος, αντικείμενο, περίοδος,
// ημ. έκδοσης, εκδότης. Καμία ευαίσθητη πληροφορία/ποσά.
// ═══════════════════════════════════════════════════════════════════════════
import { TriangleAlert, CircleCheckBig } from 'lucide-react';
import BrandMark from '@/components/BrandMark';
import { ABSENT, T } from '@/components/tokens';
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
  const card: React.CSSProperties = { width: '100%', maxWidth: 460, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '30px 30px 26px', boxShadow: 'var(--elev-1)' };
  const label: React.CSSProperties = { fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700 };
  const value: React.CSSProperties = { fontSize: 14, color: 'var(--text-primary)', fontWeight: 600, marginTop: 3 };

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, paddingBottom: 18, borderBottom: '1px solid var(--border-subtle)' }}>
          <BrandMark size={34} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>PROPERWISE</div>
            {/* Ο ΤΙΤΛΟΣ ΤΗΣ ΣΕΛΙΔΑΣ ΕΙΝΑΙ ΑΥΤΗ Η ΓΡΑΜΜΗ, ΟΧΙ ΤΟ ΟΝΟΜΑ ΤΗΣ
                ΕΦΑΡΜΟΓΗΣ. Το «PROPERWISE» από πάνω είναι σήμα, όχι επικεφαλίδα.
                Η σελίδα δεν είχε καμία: ο αναγνώστης οθόνης την ανακοίνωνε
                χωρίς όνομα, σε δημόσιο σύνδεσμο που ανοίγει άνθρωπος ο οποίος
                μπορεί να μη μας έχει ξανασυναντήσει. Ιδια γνωρίσματα, συν
                `margin:0` που ακυρώνει το προεπιλεγμένο περιθώριο του `h1`. */}
            <h1 style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 400, margin: 0 }}>Επαλήθευση γνησιότητας εγγράφου</h1>
          </div>
        </div>

        {state === 'loading' && (
          <div style={{ padding: '34px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>Έλεγχος εγγράφου…</div>
        )}

        {/* ΟΙ ΔΥΟ ΑΠΑΝΤΗΣΕΙΣ ΜΙΛΟΥΣΑΝ ΔΙΑΦΟΡΕΤΙΚΗ ΓΛΩΣΣΑ. Το «γνήσιο» ήταν
            πλακίδιο με περίγραμμα, φόντο και σύμβολο 18 εικονοστοιχείων· το «δεν
            βρέθηκε» ήταν ένα emoji ⚠️ σαράντα εικονοστοιχείων, ασύνδετο, πάνω
            από τον τίτλο.

            Δύο πράγματα ταυτόχρονα, και τα δύο μετράνε σε ΑΥΤΗ τη σελίδα:

            • Ο κανόνας του έργου λέει «χωρίς emoji — ένα εργαλείο που
              διαχειρίζεται τη φορολογία σου δεν κλείνει το μάτι». Η σελίδα όπου
              κάποιος ελέγχει αν ένα έγγραφο είναι γνήσιο είναι το χειρότερο
              σημείο για να το σπάσει: υπονομεύει ακριβώς την αξιοπιστία που
              υπάρχει για να στήσει. Και το emoji αποδίδεται από το ΛΕΙΤΟΥΡΓΙΚΟ
              του θεατή — άλλο σχήμα σε Windows, άλλο σε iPhone, άλλο σε Android.
            • Δύο καταστάσεις της ίδιας ερώτησης πρέπει να έχουν την ίδια
              γεωμετρία. Αλλιώς ο αναγνώστης δεν συγκρίνει· ξαναμαθαίνει.

            Ίδιο πλακίδιο, άλλος τόνος. Το «δεν βρέθηκε» ΔΕΝ είναι κόκκινο: δεν
            σημαίνει πλαστό, σημαίνει ότι δεν βρέθηκε — μπορεί να σαρώθηκε λάθος
            ο κωδικός. Η διάκριση την κάνουν οι λέξεις, όχι ο συναγερμός. */}
        {state === 'notfound' && (
          <div style={{ paddingTop: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--warning-soft)', border: '1px solid var(--warning-border)', borderRadius: 10, padding: '11px 14px' }}>
              <TriangleAlert size={18} strokeWidth={2.5} style={{ color: 'var(--warning)', flexShrink: 0 }} aria-hidden="true" />
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--warning)' }}>Δεν βρέθηκε έγγραφο με αυτόν τον κωδικό</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: 16 }}>
              Ο κωδικός <strong style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', letterSpacing: '.02em' }}>{id || ABSENT}</strong> δεν αντιστοιχεί σε έγγραφο που εκδόθηκε από το PROPERWISE.
              Ελέγξτε ότι σαρώσατε σωστά το QR ή ζητήστε νέο αντίγραφο από τον εκδότη.
            </p>
          </div>
        )}

        {state === 'ok' && doc && (
          <div style={{ paddingTop: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--positive-soft)', border: '1px solid var(--positive-border)', borderRadius: 10, padding: '11px 14px' }}>
              {/* Ίδιο μέγεθος, ίδιο πάχος γραμμής, ίδια θέση με το πλακίδιο από
                  πάνω. Ένα «✓» ως χαρακτήρας κειμένου δίπλα σε ένα εικονίδιο
                  γραμμής δεν κάθεται στο ίδιο οπτικό ύψος και έχει άλλο βάρος. */}
              <CircleCheckBig size={18} strokeWidth={2.5} style={{ color: 'var(--positive)', flexShrink: 0 }} aria-hidden="true" />
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--positive)' }}>Γνήσιο έγγραφο, εκδόθηκε από το PROPERWISE</span>
            </div>

            <div style={{ display: 'grid', gap: 16, marginTop: 22 }}>
              <div><div style={label}>Τύπος εγγράφου</div><div style={value}>{doc.doc_type}</div></div>
              {doc.subject && <div><div style={label}>Αντικείμενο</div><div style={value}>{doc.subject}</div></div>}
              {doc.period && <div><div style={label}>Περίοδος</div><div style={value}>{doc.period}</div></div>}
              <div><div style={label}>Ημερομηνία έκδοσης</div><div style={value}>{fmtDateTime(doc.issued_at)}</div></div>
              <div><div style={label}>Εκδότης</div><div style={value}>{doc.issuer}</div></div>
              <div><div style={label}>Αριθμός εγγράφου</div><div style={{ ...value, fontVariantNumeric: 'tabular-nums', letterSpacing: '.02em' }}>{doc.id}</div></div>
            </div>

            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.6, marginTop: 24, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
              Η σελίδα επιβεβαιώνει ότι το έγγραφο με τον παραπάνω κωδικό δημιουργήθηκε από την πλατφόρμα PROPERWISE.
              Δεν εμφανίζονται ποσά ή ευαίσθητα στοιχεία. Το περιεχόμενο του εγγράφου παραμένει ευθύνη του εκδότη.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
