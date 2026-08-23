// Σελίδα «χωρίς σύνδεση» — ό,τι βλέπει ο χρήστης όταν ο service worker δεν
// μπορεί να φέρει τη σελίδα. Στατική, χωρίς δεδομένα, χωρίς αιτήματα δικτύου.
// Στόχος: να μη μοιάζει με σφάλμα του app αλλά με ήρεμη ενημέρωση, και να
// δώσει τη μία χρήσιμη κίνηση (δοκίμασε ξανά).

import type { Metadata } from 'next';
import { T } from '@/components/tokens';

// ΤΟ ΟΝΟΜΑ ΤΟ ΒΑΖΕΙ ΤΟ ΠΡΟΤΥΠΟ, ΟΧΙ Η ΣΕΛΙΔΑ. Το app/layout.tsx ορίζει
// «template: '%s · Property OS'», οπότε γράφοντας το όνομα και εδώ η καρτέλα
// του περιηγητή έλεγε «Χωρίς σύνδεση · Property OS · Property OS».
export const metadata: Metadata = { title: 'Χωρίς σύνδεση' };

export default function OfflinePage() {
  return (
    <div style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', minHeight: '100vh', fontFamily: T.font.sans, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: T.radius.modal, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M1 1l22 22" /><path d="M16.7 16.7A10.9 10.9 0 0 1 12 18" /><path d="M5 12.5a10.9 10.9 0 0 1 5.2-2.9" /><path d="M2 8.8a16 16 0 0 1 4.3-2.6" /><path d="M22 8.8a16 16 0 0 0-9.6-3.7" /><circle cx="12" cy="20" r="1" />
          </svg>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 10px' }}>Δεν υπάρχει σύνδεση</h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 22px' }}>
          Η συσκευή σου δεν βλέπει το δίκτυο αυτή τη στιγμή. Τα δεδομένα σου είναι ασφαλή·
          μόλις επανέλθει η σύνδεση, όλα εμφανίζονται κανονικά.
        </p>
        <a href="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 44, padding: '0 22px', borderRadius: T.radius.pill, background: 'var(--accent)', color: 'var(--accent-text)', textDecoration: 'none', fontSize: 14, fontWeight: 700 }}>
          Δοκίμασε ξανά
        </a>
      </div>
    </div>
  );
}
