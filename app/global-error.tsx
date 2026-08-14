'use client';

// Root error boundary — catches errors thrown in the root layout itself. It
// must render its own <html>/<body>. Reports the error (env-gated; no-op
// without a Sentry DSN) and offers a full reload.
import { useEffect, useState } from 'react';
import { captureError } from '@/lib/observability/report';
import { recoverFromStaleBuild, alreadyRecovered } from '@/lib/recovery';

/**
 * Οι δύο παλέτες της σελίδας σφάλματος.
 *
 * Ίδιες τιμές με τις μεταβλητές του θέματος (`app/globals.css`), γραμμένες
 * κυριολεκτικά επειδή εδώ δεν έχει φορτώσει τίποτα. Αν αλλάξουν εκεί, αλλάζουν
 * και εδώ — είναι το μοναδικό σημείο της εφαρμογής όπου η αντιγραφή είναι η
 * σωστή απάντηση, γιατί η εναλλακτική είναι σελίδα χωρίς χρώματα.
 */
const PALETTE = `
  :root {
    --ge-bg: #f8f9fa; --ge-surface: #ffffff; --ge-border: #dadce0;
    --ge-text: #202124; --ge-muted: #5f6368; --ge-accent: #1560d4; --ge-on-accent: #ffffff;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --ge-bg: #202124; --ge-surface: #292a2d; --ge-border: #5f6368;
      --ge-text: #e8eaed; --ge-muted: #9aa0a6; --ge-accent: #8ab4f8; --ge-on-accent: #1f1f1f;
    }
  }
`;

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
      <head>
        {/* ── ΤΟ ΣΦΑΛΜΑ ΔΕΝ ΑΝΑΒΕΙ ΤΟ ΦΩΣ ────────────────────────────────
            Αυτό το όριο σφάλματος αντικαθιστά ΟΛΟΚΛΗΡΟ το δέντρο, μαζί με το
            layout που φορτώνει τα χρώματα του θέματος. Οπότε τα χρώματα εδώ
            είναι υποχρεωτικά κυριολεκτικά — και ήταν και τα εννέα φωτεινά.
            Ο χρήστης που δουλεύει στο σκοτεινό θέμα, στις έντεκα το βράδυ,
            έπαιρνε κατάλευκη σελίδα στα μούτρα ΤΗΝ ΩΡΑ ΠΟΥ ΚΑΤΙ ΧΑΛΑΣΕ.
            Οι δύο παλέτες ζουν σε μεταβλητές και τις διαλέγει ο ίδιος ο
            περιηγητής· δεν χρειάζεται ούτε JavaScript ούτε το θέμα μας. Οι τιμές
            είναι ΟΙ ΙΔΙΕΣ με τα `--bg-base`, `--bg-surface`, `--border-default`,
            `--text-primary`, `--text-secondary`, `--accent` και `--text-inverse`
            του `app/globals.css`. */}
        <style>{PALETTE}</style>
      </head>
      <body style={{ margin: 0, fontFamily: "-apple-system, 'Inter', system-ui, sans-serif", background: 'var(--ge-bg)', color: 'var(--ge-text)' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ maxWidth: 420, textAlign: 'center' }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px', color: 'var(--ge-text)' }}>
              {busy ? 'Επαναφορά…' : 'Κάτι πήγε στραβά'}
            </h2>
            <p style={{ fontSize: 14, color: 'var(--ge-muted)', margin: '0 0 20px', lineHeight: 1.55 }}>
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
                  background: 'var(--ge-surface)', border: '1px solid var(--ge-border)', borderRadius: 10,
                  fontSize: 12, lineHeight: 1.5, color: 'var(--ge-muted)',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 160, overflow: 'auto',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                }}>
                {error.message}{error.digest ? `\ndigest: ${error.digest}` : ''}
                {`\nbuild: ${process.env.NEXT_PUBLIC_BUILD_SHA ?? 'dev'}`}
              </pre>
            )}
            {!busy && (
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button onClick={reset}
                  style={{ height: 44, padding: '0 24px', borderRadius: 100, border: 'none', background: 'var(--ge-accent)', color: 'var(--ge-on-accent)', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Επαναφόρτωση
                </button>
                <button onClick={() => { setBusy(true); void recoverFromStaleBuild(true); }}
                  style={{ height: 44, padding: '0 24px', borderRadius: 100, border: '1px solid var(--ge-border)', background: 'transparent', color: 'var(--ge-text)', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
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
