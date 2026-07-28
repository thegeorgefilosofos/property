'use client';

// ═══════════════════════════════════════════════════════════════════════════
// PROPERTY OS — ο ΜΟΝΑΔΙΚΟΣ υποδοχέας toast.
// Το «γιατί» και το API ζουν στο components/toastBus.ts (χωρίς React), ώστε να
// μπορεί να καλεί `notify()` και κώδικας που δεν είναι component.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState, useRef } from 'react';
import { T, type Tone } from './tokens';
import { subscribeToasts, type ToastItem } from './toastBus';

// Ξανα-εξάγονται εδώ ώστε ένα component να χρειάζεται μία μόνο εισαγωγή.
export { notify, notifyOk, notifyError, TOAST_MS } from './toastBus';
export type { ToastOptions } from './toastBus';

const DOT: Record<Tone, string> = {
  accent:   'var(--accent)',
  info:     'var(--info)',
  positive: 'var(--positive)',
  warning:  'var(--warning)',
  negative: 'var(--negative)',
  neutral:  'var(--text-tertiary)',
};

/**
 * Ο μοναδικός υποδοχέας. Μπαίνει ΜΙΑ φορά, ψηλά στο δέντρο.
 *
 * z-index 2000: πάνω από τα παράθυρα (1000) και από το συρτάρι κινητού (1500),
 * γιατί ένα toast που κρύβεται πίσω από modal είναι χειρότερο από καθόλου toast
 * — ο χρήστης νομίζει ότι η ενέργεια δεν έγινε και την επαναλαμβάνει.
 */
export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const push = (t: ToastItem) => {
      // Το πολύ τρία ταυτόχρονα: παραπάνω και η στοίβα σκεπάζει την οθόνη.
      setItems(prev => [...prev, t].slice(-3));
      if (t.duration && t.duration > 0) {
        timers.current.set(t.id, setTimeout(() => {
          setItems(prev => prev.filter(x => x.id !== t.id));
          timers.current.delete(t.id);
        }, t.duration));
      }
    };
    const unsubscribe = subscribeToasts(push);
    const running = timers.current;
    return () => {
      unsubscribe();
      running.forEach(clearTimeout);
      running.clear();
    };
  }, []);

  const dismiss = (id: number) => {
    const t = timers.current.get(id);
    if (t) { clearTimeout(t); timers.current.delete(id); }
    setItems(prev => prev.filter(x => x.id !== id));
  };

  if (!items.length) return null;

  return (
    <div
      // aria-live: ο χρήστης με αναγνώστη οθόνης πρέπει να ΑΚΟΥΣΕΙ την
      // επιβεβαίωση. Το native alert το έκανε αυτό δωρεάν· εδώ το δηλώνουμε.
      aria-live="polite"
      aria-atomic="false"
      style={{
        position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)',
        zIndex: 2000, display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 8, pointerEvents: 'none', maxWidth: 'min(92vw, 460px)',
      }}
    >
      {items.map(t => (
        <div
          key={t.id}
          style={{
            pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 10,
            background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
            borderRadius: T.radius.inner + 2, padding: '12px 18px',
            boxShadow: '0 10px 28px rgba(0,0,0,0.16)',
            fontFamily: T.font.sans, fontSize: 13, lineHeight: 1.45,
            color: 'var(--text-primary)', animation: 'po-toast-in 180ms ease-out',
          }}
        >
          <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: DOT[t.tone ?? 'neutral'], flexShrink: 0 }} />
          <span>{t.text}</span>
          {t.action && (
            <button
              type="button"
              onClick={() => { t.action!.onClick(); dismiss(t.id); }}
              style={{
                marginLeft: 4, background: 'none', border: 'none', padding: '2px 4px',
                color: 'var(--accent)', fontFamily: T.font.sans, fontSize: 13,
                fontWeight: 600, cursor: 'pointer', flexShrink: 0,
              }}
            >{t.action.label}</button>
          )}
          {(!t.duration || t.duration <= 0) && (
            <button
              type="button" aria-label="Κλείσιμο" onClick={() => dismiss(t.id)}
              style={{ marginLeft: 4, background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: 15, cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}
            >×</button>
          )}
        </div>
      ))}
    </div>
  );
}
