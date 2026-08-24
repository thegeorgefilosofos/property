'use client';

// ═══════════════════════════════════════════════════════════════════════════
// StartPanel — «Από πού ξεκινάς», στην κορυφή της αρχικής, όσο κρατά η δοκιμή
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΔΕΙΧΝΕΙ ΚΑΙ ΤΙ ΟΧΙ. Τρία βήματα, οι ημέρες που απομένουν, και δύο πόρτες:
// το παράδειγμα και η Νόα. Καμία διαφήμιση πακέτου, κανένα «αναβάθμισε τώρα» —
// αυτά ζουν στο BillingNudge, που έχει δική του στιγμή.
//
// ΓΙΑΤΙ ΔΕΝ ΕΙΝΑΙ Card. Το `Card` είναι δοχείο περιεχομένου μέσα στη σελίδα·
// αυτό είναι η κορυφή της σελίδας και πρέπει να διαβάζεται ως πλαίσιο, όχι ως
// άλλη μια κάρτα ανάμεσα σε επτά. Κρατά τα ίδια tokens (ίδια ακτίνα, ίδιο
// περίγραμμα, ίδια ανύψωση) αλλά με τον τόνο του accent στο περίγραμμα.
//
// Η ΛΟΓΙΚΗ ΔΕΝ ΕΙΝΑΙ ΕΔΩ. Ποια βήματα, ποια κλειστά, πότε φεύγει ο πίνακας:
// lib/home/start.ts, με δικές του δοκιμές. Εδώ μένει μόνο η απόδοση.
// ═══════════════════════════════════════════════════════════════════════════

import { T, TT } from '@/components/Theme';
import { daysLabel, stepsLabel, type StartPanelState } from '@/lib/home/start';

const Tick = ({ state }: { state: 'done' | 'now' | 'todo' }) => {
  if (state === 'done') return (
    <span aria-hidden style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--accent)', color: 'var(--accent-text)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
    </span>
  );
  return (
    <span aria-hidden style={{
      width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 2, boxSizing: 'border-box',
      border: `2px solid ${state === 'now' ? 'var(--accent)' : 'var(--border-default)'}`,
      background: state === 'now' ? 'var(--accent-soft)' : 'transparent',
    }} />
  );
};

export default function StartPanel({ state, collapsed, onToggle, onNavigate, onPreview, onAsk }: {
  state: StartPanelState;
  collapsed: boolean;
  onToggle: (next: boolean) => void;
  onNavigate: (tab: string) => void;
  onPreview: () => void;
  onAsk: () => void;
}) {
  if (!state.visible) return null;

  const quiet: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer',
    // Το ύψος βγαίνει από την κλίμακα και όχι από το padding: γυμνό κουμπί
    // κειμένου με padding 6 είναι στόχος 27 εικονοστοιχείων.
    display: 'inline-flex', alignItems: 'center', minHeight: T.h.sm,
    fontFamily: T.font.sans, fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', padding: '6px 4px',
  };
  const shell: React.CSSProperties = {
    border: '1px solid var(--accent-border)', borderRadius: T.radius.card,
    background: 'var(--surface-raised)', boxShadow: 'var(--highlight-inset), var(--elev-1)',
    marginBottom: T.sp.lg,
  };

  // ── ΣΥΜΠΤΥΓΜΕΝΟΣ ────────────────────────────────────────────────────────
  // Μία γραμμή, με τα δύο μεγέθη που ενδιαφέρουν: πόσα μένουν και πόσος καιρός.
  if (collapsed) return (
    <div style={{ ...shell, display: 'flex', alignItems: 'center', gap: T.sp.md, padding: '12px 16px', flexWrap: 'wrap' }}>
      <span style={{ ...TT.bodySm, color: 'var(--text-primary)', fontWeight: 700 }}>Από πού ξεκινάς</span>
      <span style={{ ...TT.caption, flex: 1, minWidth: 0 }}>
        {stepsLabel(state.open)}, απομένουν <span style={{ fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{daysLabel(state.daysLeft)}</span>
      </span>
      <button onClick={() => onToggle(false)} style={quiet}>Άνοιγμα</button>
    </div>
  );

  return (
    <div style={{ ...shell, padding: '18px 20px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: T.sp.lg, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...TT.label, color: 'var(--accent)' }}>ΔΟΚΙΜΑΣΤΙΚΗ ΠΕΡΙΟΔΟΣ</div>
          <div style={{ ...TT.h2, marginTop: 6 }}>Από πού ξεκινάς</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ ...TT.caption }}>Απομένουν</div>
          <div style={{ ...TT.kpi, fontSize: 20, marginTop: 3 }}>{daysLabel(state.daysLeft)}</div>
        </div>
      </div>

      <ul style={{ listStyle: 'none', margin: '16px 0 0', padding: 0 }}>
        {state.steps.map((s, i) => {
          // ΜΟΝΟ ΕΝΑ ΒΗΜΑ ΕΙΝΑΙ «ΤΩΡΑ»: το πρώτο ανοιχτό. Δύο ταυτόχρονα
          // τονισμένα βήματα δεν είναι ιεραρχία, είναι δύο κουμπιά που
          // διεκδικούν το ίδιο κλικ.
          const isNow = !s.done && state.steps.slice(0, i).every(p => p.done);
          return (
            <li key={s.key} style={{
              display: 'flex', alignItems: 'flex-start', gap: T.sp.md, padding: '11px 0',
              borderTop: i === 0 ? 'none' : '1px solid var(--border-subtle)',
            }}>
              <Tick state={s.done ? 'done' : isNow ? 'now' : 'todo'} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...TT.bodySm, color: s.done ? 'var(--text-tertiary)' : 'var(--text-primary)', fontWeight: 700, textDecoration: s.done ? 'line-through' : 'none' }}>{s.title}</div>
                {!s.done && <div style={{ ...TT.caption, marginTop: 2 }}>{s.hint}</div>}
              </div>
              {!s.done && (
                <button onClick={() => onNavigate(s.nav)} style={{ ...quiet, color: 'var(--accent)', flexShrink: 0 }}>Άνοιγμα</button>
              )}
            </li>
          );
        })}
      </ul>

      <div style={{ display: 'flex', alignItems: 'center', gap: T.sp.sm, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
        <button onClick={onPreview} style={{ ...quiet, color: 'var(--text-secondary)', border: '1px solid var(--border-default)', borderRadius: T.radius.pill, padding: '7px 14px' }}>Δες ένα παράδειγμα</button>
        <button onClick={onAsk} style={{ ...quiet, color: 'var(--text-secondary)', border: '1px solid var(--border-default)', borderRadius: T.radius.pill, padding: '7px 14px' }}>Ρώτησε τη Νόα</button>
        <button onClick={() => onToggle(true)} style={{ ...quiet, marginLeft: 'auto' }}>Σύμπτυξη</button>
      </div>
      <div style={{ ...TT.caption, marginTop: 10 }}>
        Το παράδειγμα αποτελείται από ένα ακίνητο που χρησιμοποίησε το PROPERWISE μια ολόκληρη χρονιά, ώστε να διαπιστώσεις εύκολα και γρήγορα τις δυνατότητές του.
      </div>
    </div>
  );
}
