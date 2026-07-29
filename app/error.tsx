'use client';

// Route-segment error boundary.
//
// ΓΙΑΤΙ ΔΕΝ ΑΡΚΕΙ ΤΟ reset():
// Το reset() του React ξαναχτίζει το ΙΔΙΟ δέντρο από ΤΑ ΙΔΙΑ modules. Αν το
// σφάλμα προέρχεται από αρχεία παλιού build που σέρβιρε ο service worker, το
// «Δοκίμασε ξανά» δίνει ακριβώς το ίδιο αποτέλεσμα, για πάντα. Ο χρήστης μένει
// κλειδωμένος έξω από την εφαρμογή του χωρίς να έχει κάνει τίποτα λάθος.
//
// Γι' αυτό εδώ γίνεται ΜΙΑ αυτόματη απόπειρα καθαρισμού και επαναφόρτωσης, και
// μετά προσφέρεται και χειροκίνητα. Δεν χάνεται τίποτα: σβήνονται μόνο τα
// αποθηκευμένα αρχεία του build, όχι η συνεδρία ούτε τα δεδομένα.
import { useEffect, useState } from 'react';
import { captureError } from '@/lib/observability/report';
import { recoverFromStaleBuild, alreadyRecovered } from '@/lib/recovery';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Παράγεται κατά την απόδοση και όχι σε effect: αν η επαναφορά δεν έχει γίνει
  // ακόμη, δείχνουμε «Επαναφορά…» από την πρώτη κιόλας εικόνα, χωρίς αναλαμπή.
  const [busy, setBusy] = useState(!alreadyRecovered());

  useEffect(() => {
    captureError(error, { digest: error.digest, boundary: 'segment' });
    void recoverFromStaleBuild().then(started => { if (!started) setBusy(false); });
  }, [error]);

  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 460, textAlign: 'center' }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>
          {busy ? 'Επαναφορά…' : 'Κάτι πήγε στραβά'}
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text-muted, #5f6368)', margin: '0 0 20px', lineHeight: 1.55 }}>
          {busy
            ? 'Καθαρίζουμε τα αποθηκευμένα αρχεία και ξαναφορτώνουμε. Τα δεδομένα και η σύνδεσή σου δεν επηρεάζονται.'
            : 'Παρουσιάστηκε ένα απρόσμενο σφάλμα.'}
        </p>
        {/* ΤΟ ΜΗΝΥΜΑ, ΟΡΑΤΟ.
            Μια οθόνη που λέει μόνο «κάτι πήγε στραβά» δεν βοηθά κανέναν: ούτε
            τον χρήστη να καταλάβει αν φταίει το δίκτυό του, ούτε εμάς να
            διορθώσουμε. Το κείμενο είναι τεχνικό και μένει διακριτικό, αλλά
            είναι εκεί και αντιγράφεται με ένα κλικ. */}
        {!busy && (error.message || error.digest) && (
          <pre
            onClick={() => { try { void navigator.clipboard.writeText(`${error.message}\n${error.digest ?? ''}`); } catch { /* χωρίς άδεια */ } }}
            title="Κλικ για αντιγραφή"
            style={{
              textAlign: 'left', margin: '0 0 18px', padding: '10px 12px', cursor: 'copy',
              background: 'var(--bg-elevated, #f1f3f4)', border: '1px solid var(--border-subtle, #dadce0)',
              borderRadius: 10, fontSize: 11.5, lineHeight: 1.5, color: 'var(--text-secondary, #5f6368)',
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
              style={{ height: 44, padding: '0 24px', borderRadius: 100, border: 'none', background: 'var(--accent, #1a73e8)', color: 'var(--accent-text, #fff)', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Δοκίμασε ξανά
            </button>
            <button onClick={() => { setBusy(true); void recoverFromStaleBuild(true); }}
              style={{ height: 44, padding: '0 24px', borderRadius: 100, border: '1px solid var(--border-default, #dadce0)', background: 'transparent', color: 'var(--text-primary, #202124)', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Καθαρισμός και επαναφόρτωση
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
