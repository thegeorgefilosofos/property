'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ΜΙΑ ΙΔΙΩΤΙΚΗ ΔΙΕΥΘΥΝΣΗ, ΕΝΑ ΣΧΗΜΑ
// ─────────────────────────────────────────────────────────────────────────
// Δύο λειτουργίες δίνουν στον ιδιοκτήτη μια διεύθυνση που είναι ΜΥΣΤΙΚΟ: η
// διεύθυνση που δέχεται λογαριασμούς με email, και η διεύθυνση iCal που
// διαβάζει τις προθεσμίες. Και οι δύο θέλουν ακριβώς τα ίδια τέσσερα:
//
//   · να δείχνουν τη διεύθυνση όταν υπάρχει, και ΤΙΠΟΤΑ όταν δεν λειτουργεί·
//   · κουμπί αντιγραφής, γιατί κανείς δεν πληκτρολογεί δεκαέξι ψηφία·
//   · μια πρόταση για το τι σημαίνει «μυστικό» εδώ·
//   · αλλαγή διεύθυνσης που ΡΩΤΑΕΙ πρώτα, επειδή η παλιά πεθαίνει αμέσως.
//
// Γραμμένα δύο φορές, θα ήταν δύο ελαφρώς διαφορετικές διατυπώσεις για την
// ίδια έννοια και δύο σημεία να ξεχαστεί η προειδοποίηση. Το σχήμα ζει εδώ·
// κάθε λειτουργία δίνει μόνο τα δικά της λόγια.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, type ReactNode } from 'react';
import { T, TT, Btn } from '@/components/Theme';
import { SetRow } from './SettingsKit';

interface Props {
  title: string;
  desc: string;
  /** Η διεύθυνση. Κενή σημαίνει «δεν υπάρχει ακόμη» ή «δεν λειτουργεί». */
  value: string;
  /** Εχει απαντήσει η βάση; Οσο δεν έχει, δεν λέμε τίποτα. */
  loaded: boolean;
  /** Τι λέμε όταν δεν υπάρχει διεύθυνση. Μία πρόταση, με τον λόγο. */
  unavailable: ReactNode;
  /** Τι σημαίνει ότι είναι μυστική. */
  hint: ReactNode;
  /** Τι χάνεται με την αλλαγή. Ο χρήστης το διαβάζει ΠΡΙΝ, όχι μετά. */
  rotateHint: string;
  /** Ο,τι θέλει να προσθέσει η λειτουργία δίπλα στην αντιγραφή. */
  actions?: ReactNode;
  onRotate: () => Promise<void>;
}

export default function SecretAddressRow({
  title, desc, value, loaded, unavailable, hint, rotateHint, actions, onRotate,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Χωρίς άδεια στο πρόχειρο, η διεύθυνση είναι ήδη ορατή και επιλέξιμη.
    }
  };

  const rotate = async () => {
    setBusy(true);
    await onRotate();
    setBusy(false);
    setAsking(false);
  };

  return (
    <SetRow title={title} desc={desc}
      control={value ? <Btn variant="secondary" onClick={copy}>{copied ? 'Αντιγράφηκε' : 'Αντιγραφή'}</Btn> : undefined}>

      {!loaded ? null : !value ? (
        <div style={{ ...TT.bodySm, color: 'var(--text-secondary)' }}>{unavailable}</div>
      ) : (
        <>
          <div style={{
            fontFamily: T.font.num, fontSize: 14, fontWeight: 600,
            color: 'var(--text-primary)', wordBreak: 'break-all',
            padding: '10px 12px', borderRadius: T.radius.btn,
            background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
          }}>{value}</div>

          <div style={{ ...TT.bodySm, color: 'var(--text-tertiary)', marginTop: 8 }}>{hint}</div>

          {asking ? (
            <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ ...TT.bodySm, color: 'var(--text-secondary)' }}>{rotateHint}</span>
              <Btn variant="primary" onClick={rotate} disabled={busy}>{busy ? 'Αλλάζει…' : 'Νέα διεύθυνση'}</Btn>
              <Btn variant="secondary" onClick={() => setAsking(false)} disabled={busy}>Ακύρωση</Btn>
            </div>
          ) : (
            <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {actions}
              <Btn variant="secondary" onClick={() => setAsking(true)}>Αλλαγή διεύθυνσης</Btn>
            </div>
          )}
        </>
      )}
    </SetRow>
  );
}
