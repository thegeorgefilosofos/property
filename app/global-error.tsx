'use client';

// Root error boundary — catches errors thrown in the root layout itself. It
// must render its own <html>/<body>. Reports the error (env-gated; no-op
// without a Sentry DSN) and offers a full reload.
import { useEffect, useState } from 'react';
import { captureError } from '@/lib/observability/report';
import { recoverFromStaleBuild, alreadyRecovered } from '@/lib/recovery';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Το reset() ξαναχτίζει το ίδιο δέντρο από τα ίδια modules. Αν φταίνε αρχεία
  // παλιού build, το κουμπί δεν οδηγεί πουθενά. Μία αυτόματη απόπειρα
  // καθαρισμού, και μετά και χειροκίνητα.
  const [busy, setBusy] = useState(!alreadyRecovered());

  useEffect(() => {
    captureError(error, { digest: error.digest, boundary: 'global' });
    void recoverFromStaleBuild().then(started => { if (!started) setBusy(false); });
  }, [error]);

  return (
    <html lang="el">
      <body style={{ margin: 0, fontFamily: "-apple-system, 'Inter', system-ui, sans-serif", background: '#f1f3f4' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ maxWidth: 420, textAlign: 'center' }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px', color: '#202124' }}>
              {busy ? 'Επαναφορά…' : 'Κάτι πήγε στραβά'}
            </h2>
            <p style={{ fontSize: 14, color: '#5f6368', margin: '0 0 20px', lineHeight: 1.55 }}>
              {busy
                ? 'Καθαρίζουμε τα αποθηκευμένα αρχεία και ξαναφορτώνουμε. Τα δεδομένα και η σύνδεσή σου δεν επηρεάζονται.'
                : 'Παρουσιάστηκε ένα απρόσμενο σφάλμα.'}
            </p>
            {/* Το μήνυμα ορατό: αλλιώς ούτε ο χρήστης καταλαβαίνει τι έγινε ούτε
                εμείς μπορούμε να το διορθώσουμε. Κλικ για αντιγραφή. */}
            {!busy && (error.message || error.digest) && (
              <pre
                onClick={() => { try { void navigator.clipboard.writeText(`${error.message}\n${error.digest ?? ''}`); } catch { /* χωρίς άδεια */ } }}
                title="Κλικ για αντιγραφή"
                style={{
                  textAlign: 'left', margin: '0 0 18px', padding: '10px 12px', cursor: 'copy',
                  background: '#fff', border: '1px solid #dadce0', borderRadius: 10,
                  fontSize: 11.5, lineHeight: 1.5, color: '#5f6368',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 160, overflow: 'auto',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                }}>
                {error.message}{error.digest ? `\ndigest: ${error.digest}` : ''}
              </pre>
            )}
            {!busy && (
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button onClick={reset}
                  style={{ height: 44, padding: '0 24px', borderRadius: 100, border: 'none', background: '#1a73e8', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Επαναφόρτωση
                </button>
                <button onClick={() => { setBusy(true); void recoverFromStaleBuild(true); }}
                  style={{ height: 44, padding: '0 24px', borderRadius: 100, border: '1px solid #dadce0', background: 'transparent', color: '#202124', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Καθαρισμός και επαναφόρτωση
                </button>
              </div>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
