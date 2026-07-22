'use client';

// Root error boundary — catches errors thrown in the root layout itself. It
// must render its own <html>/<body>. Reports the error (env-gated; no-op
// without a Sentry DSN) and offers a full reload.
import { useEffect } from 'react';
import { captureError } from '@/lib/observability/report';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    captureError(error, { digest: error.digest, boundary: 'global' });
  }, [error]);

  return (
    <html lang="el">
      <body style={{ margin: 0, fontFamily: "-apple-system, 'Inter', system-ui, sans-serif", background: '#f1f3f4' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ maxWidth: 420, textAlign: 'center' }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px', color: '#202124' }}>Κάτι πήγε στραβά</h2>
            <p style={{ fontSize: 14, color: '#5f6368', margin: '0 0 20px' }}>
              Παρουσιάστηκε ένα απρόσμενο σφάλμα. Δοκίμασε να φορτώσεις ξανά τη σελίδα.
            </p>
            <button
              onClick={reset}
              style={{ height: 44, padding: '0 24px', borderRadius: 100, border: 'none', background: '#1a73e8', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Επαναφόρτωση
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
