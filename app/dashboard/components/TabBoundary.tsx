'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ΜΙΑ ΚΑΡΤΕΛΑ ΠΟΥ ΣΠΑΕΙ ΔΕΝ ΡΙΧΝΕΙ ΟΛΗ ΤΗΝ ΕΦΑΡΜΟΓΗ.
//
// ΤΟ ΠΡΟΒΛΗΜΑ ΠΟΥ ΛΥΝΕΙ:
// Ο πίνακας ελέγχου φορτώνει είκοσι δύο καρτέλες μέσα σε ΕΝΑ δέντρο React.
// Ένα σφάλμα σε οποιαδήποτε από αυτές ανεβαίνει ως το πλησιέστερο boundary, που
// ήταν το boundary ολόκληρης της διαδρομής. Αποτέλεσμα: μια λεπτομέρεια σε μια
// καρτέλα που ο χρήστης ίσως δεν ανοίγει ποτέ, και η εφαρμογή δεν ανοίγει
// καθόλου. Ο ιδιοκτήτης χάνει πρόσβαση στα ενοίκια, στο ημερολόγιο και στα
// έγγραφά του επειδή κάπου αλλού μια σύγκριση τιμών βρήκε ένα null.
//
// Αυτό δεν είναι υποθετικό: συνέβη.
//
// ΤΙ ΚΑΝΕΙ:
// Κάθε καρτέλα αποδίδεται μέσα σε δικό της boundary. Αν σπάσει, σπάει ΜΟΝΟ
// αυτή. Η υπόλοιπη εφαρμογή, η πλοήγηση και τα δεδομένα μένουν προσβάσιμα, και
// ο χρήστης βλέπει τι έγινε αντί για μια λευκή οθόνη.
//
// ΓΙΑΤΙ ΚΛΑΣΗ ΚΑΙ ΟΧΙ ΣΥΝΑΡΤΗΣΗ:
// Το React δίνει σύλληψη σφαλμάτων μόνο σε class component. Δεν υπάρχει hook
// γι' αυτό, και δεν είναι παράλειψη: το boundary πρέπει να ζει έξω από τον
// κύκλο ζωής που κατέρρευσε.
// ═══════════════════════════════════════════════════════════════════════════

import { Component, type ReactNode } from 'react';
import { captureError } from '@/lib/observability/report';
import { T } from '@/components/tokens';

interface Props {
  /** Ποια καρτέλα, για το μήνυμα και την αναφορά. */
  name: string;
  children: ReactNode;
}

interface State { error: Error | null }

export default class TabBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    captureError(error, { boundary: 'tab', tab: this.props.name });
  }

  // Αλλάζοντας καρτέλα, η επόμενη ξεκινά καθαρή. Χωρίς αυτό, ένα σφάλμα σε μία
  // καρτέλα θα κρατούσε το boundary σε κατάσταση σφάλματος και για τις άλλες.
  componentDidUpdate(prev: Props) {
    if (prev.name !== this.props.name && this.state.error) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div style={{ padding: '32px 8px', fontFamily: T.font.sans }}>
        <div style={{ maxWidth: 560 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
            Αυτή η ενότητα δεν φόρτωσε
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 14 }}>
            Οι υπόλοιπες ενότητες λειτουργούν κανονικά και τα δεδομένα σου είναι ασφαλή.
            Δοκίμασε ξανά, ή συνέχισε από το μενού.
          </div>

          {/* Το μήνυμα ορατό και αντιγράψιμο: αλλιώς η αναφορά του προβλήματος
              γίνεται περιγραφή αντί για στοιχείο. */}
          <pre
            onClick={() => { try { void navigator.clipboard.writeText(error.message); } catch { /* χωρίς άδεια */ } }}
            title="Κλικ για αντιγραφή"
            style={{
              margin: '0 0 14px', padding: '10px 12px', cursor: 'copy',
              background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
              borderRadius: 10, fontSize: 12, lineHeight: 1.5, color: 'var(--text-tertiary)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 140, overflow: 'auto',
              fontFamily: T.font.mono,
            }}>
            {this.props.name}: {error.message}
          </pre>

          <button
            onClick={() => this.setState({ error: null })}
            style={{
              height: 40, padding: '0 20px', borderRadius: 100, border: 'none',
              background: 'var(--accent)', color: 'var(--accent-text)',
              fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}>
            Δοκίμασε ξανά
          </button>
        </div>
      </div>
    );
  }
}
