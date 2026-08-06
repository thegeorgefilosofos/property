'use client';

// ═══════════════════════════════════════════════════════════════════════════
// Η ΝΟΑ ΣΤΗΝ ΚΟΡΥΦΗ, ΟΧΙ ΠΙΣΩ ΑΠΟ ΕΝΑ ΠΛΩΤΟ ΚΟΥΜΠΙ
// ─────────────────────────────────────────────────────────────────────────
// Ο βοηθός ζούσε αποκλειστικά σε ένα στρογγυλό κουμπί κάτω δεξιά. Για κάτι
// που θέλει να είναι το ΚΥΡΙΟ μονοπάτι — «ρώτα, μη ψάχνεις σε καρτέλες» —
// αυτό ήταν το πιο μακρινό σημείο της οθόνης, και απαιτούσε ποντίκι.
//
// Εδώ μπαίνει μία γραμμή στην κορυφή της Επισκόπησης: ο χαιρετισμός με τα
// ΔΙΚΑ ΤΟΥ νούμερα, και δύο ερωτήσεις που αφορούν αυτό ακριβώς το ακίνητο
// αυτή τη στιγμή. Το άγγιγμα ανοίγει τη Νόα με την ερώτηση συμπληρωμένη.
//
// ΜΗΔΕΝ ΝΕΑ ΥΠΟΔΟΜΗ. Ο χαιρετισμός και οι προτάσεις παράγονται από το
// lib/assistant/openers.ts, που ήδη τηρεί τον κανόνα «ποτέ νούμερο που δεν
// υπάρχει». Το άνοιγμα γίνεται με το συμβάν `pos:ask`, τον ίδιο δίαυλο που
// χρησιμοποιεί ήδη ο έλεγχος ισοζυγίου.
//
// ΓΙΑΤΙ ΔΕΝ ΕΙΝΑΙ ΚΑΡΤΑ. Μια κάρτα με πλαίσιο και σκιά θα διεκδικούσε τη θέση
// του Ταμείου, που είναι ο λόγος που ανοίγει κανείς την εφαρμογή. Είναι μία
// γραμμή κειμένου και δύο διακριτικά κουμπιά: παρούσα, όχι απαιτητική.
// ═══════════════════════════════════════════════════════════════════════════
import { useSyncExternalStore } from 'react';
import { T } from '@/components/Theme';
import { ASSISTANT_NAME } from '@/lib/assistant/identity';
import { greeting, suggestedOpeners, type OpenerContext } from '@/lib/assistant/openers';
import { loadPrefs, PREFS_EVENT } from './assistantPersona';

/** Ανοίγει τη Νόα. Κενή ερώτηση = απλό άνοιγμα· `send` = στέλνει αμέσως. */
export const askAssistant = (q = '', send = false): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('pos:ask', { detail: { q, send } }));
};

// ── Ο πληθυντικός ευγενείας, από την ΙΔΙΑ ρύθμιση που κρατά η Νόα ──────────
// Δύο μονοπάτια για την ίδια επιλογή θα σήμαινε ότι η γραμμή μιλά στον ενικό
// ενώ η συνομιλία δίπλα της στον πληθυντικό. Είναι εξωτερική αποθήκη
// (localStorage), όχι κατάσταση της οθόνης, γι' αυτό διαβάζεται όπως διαβάζεται
// μια εξωτερική αποθήκη — και ο διακομιστής, που δεν έχει localStorage,
// απαντά «ενικός», δηλαδή την προεπιλογή.
const subscribeFormal = (onChange: () => void): (() => void) => {
  window.addEventListener(PREFS_EVENT, onChange);   // αλλαγή στην ίδια καρτέλα
  window.addEventListener('storage', onChange);     // αλλαγή σε άλλη καρτέλα
  return () => {
    window.removeEventListener(PREFS_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
};
const readFormal = () => loadPrefs()?.formal === true;

export default function AssistantStrip({ ctx }: { ctx: OpenerContext | null }) {
  const formal = useSyncExternalStore(subscribeFormal, readFormal, () => false);

  // Δύο ερωτήσεις, όχι πέντε: η λίστα είναι ταξινομημένη κατά επείγον, και μια
  // σειρά από κουμπιά παύει να είναι πρόταση και γίνεται μενού.
  const asks = suggestedOpeners(ctx).slice(0, 2);

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap',
      marginBottom: 18, paddingBottom: 16, borderBottom: '1px solid var(--border-subtle)',
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: '50%', flexShrink: 0, marginTop: 1,
        background: 'var(--accent-soft)', border: '1px solid var(--accent-border)',
        color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: T.font.sans, fontSize: 13, fontWeight: 700,
      }} aria-hidden>{ASSISTANT_NAME.charAt(0)}</div>

      <div style={{ flex: 1, minWidth: 220 }}>
        <p style={{
          fontFamily: T.font.sans, fontSize: 13.5, lineHeight: 1.55,
          color: 'var(--text-secondary)', margin: 0,
        }}>{greeting(ASSISTANT_NAME, ctx, formal)}</p>

        {asks.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            {asks.map(q => (
              <button key={q} type="button" onClick={() => askAssistant(q, true)}
                style={{
                  padding: '0 13px', height: T.h.sm, borderRadius: T.radius.pill,
                  border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)', fontFamily: T.font.sans, fontSize: 12.5,
                  cursor: 'pointer', textAlign: 'left', maxWidth: '100%',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                {q}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
