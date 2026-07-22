'use client';

// Route-segment error boundary. Reports the error (env-gated; no-op without a
// Sentry DSN) and offers a retry. Keeps the app from showing a blank screen.
import { useEffect } from 'react';
import { captureError } from '@/lib/observability/report';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    captureError(error, { digest: error.digest, boundary: 'segment' });
  }, [error]);

  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>Κάτι πήγε στραβά</h2>
        <p style={{ fontSize: 14, color: 'var(--text-muted, #5f6368)', margin: '0 0 20px' }}>
          Παρουσιάστηκε ένα απρόσμενο σφάλμα. Δοκίμασε ξανά.
        </p>
        <button
          onClick={reset}
          style={{ height: 44, padding: '0 24px', borderRadius: 100, border: 'none', background: 'var(--accent, #1a73e8)', color: 'var(--accent-text, #fff)', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Δοκίμασε ξανά
        </button>
      </div>
    </div>
  );
}
